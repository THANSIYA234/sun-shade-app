// Proxies OpenRouteService requests so the API key never reaches the browser bundle.
// In dev, Vite invokes the middleware on every request. In production, mount the same
// handler behind any Node-friendly host (Express, Fastify, serverless, etc.).
/* eslint-env node */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import https from "node:https";
import path from "node:path";

// Load .env into process.env ourselves — Vite's loadEnv() exposes it to
// import.meta.env (client side) but doesn't reliably populate process.env at
// configureServer() in plugin-only mode.
const parseEnvFile = (file) => {
  try {
    const text = readFileSync(file, "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      // Strip optional surrounding quotes or backticks.
      v = v.replace(/^['"`]+|['"`]+$/g, "");
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    /* file missing */
  }
};
parseEnvFile(path.resolve(process.cwd(), ".env"));

const ORS_HOST = "api.heigit.org";
const API_KEY =
  process.env.OPENROUTESERVICE_API_KEY ||
  process.env.VITE_OPENROUTESERVICE_API_KEY;

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    ...headers,
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

// --- TTL cache ---------------------------------------------------------------
// The dev proxy is hit repeatedly while the user tweaks the form, and ORS has a
// tight free-tier quota, so identical upstream requests are memoised in memory.
// Entries carry their own expiry (TTL) and the map is capped so it cannot grow
// without bound; the oldest entry is dropped once the cap is exceeded.
const CACHE_MAX_ENTRIES = 200;
const CACHE_TTL_GEOCODE_MS = 24 * 60 * 60 * 1000; // 24 h — addresses barely change.
const CACHE_TTL_DIRECTIONS_MS = 10 * 60 * 1000; // 10 min — routes depend on live traffic.

const cache = new Map();

const sha1 = (body) =>
  createHash("sha1")
    .update(body && body.length ? body : Buffer.alloc(0))
    .digest("hex");

// Cache key: method + ' ' + pathname + '?' + queryString + ' ' + sha1(body)
const cacheKey = (method, pathname, queryString, body) =>
  `${method} ${pathname}?${queryString} ${sha1(body)}`;

const cacheGet = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry;
};

const cacheSet = (key, ttlMs, value) => {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { ...value, expiresAt: Date.now() + ttlMs });
  // Beyond the cap: drop the oldest entry (Map keeps insertion order).
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
};

// --- Geocoding result ranking ------------------------------------------------
// OpenRouteService returns candidates in its own order, which is not always the
// place the user meant: "Central Park, New York" ranks a locality called
// Bethpage above the park itself. Candidates are scored on how well the place
// name and the rest of the query ("New York") match, with more specific layers
// (a venue or a street) preferred over a broad locality or county.

const LAYER_PRIORITY = {
  venue: 0,
  street: 1,
  address: 2,
  neighbourhood: 3,
  borough: 4,
  locality: 5,
  county: 6,
  macroregion: 7,
  region: 8,
  state: 9,
  country: 10,
  continent: 11,
};

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Score one geocoding candidate against the user's query. */
function scoreGeocodeFeature(feature, query) {
  const props = feature?.properties ?? {};
  const name = normalize(props.name || props.label || "");

  // The query is read as comma separated parts: "Central Park, New York" is a
  // place name plus the place it belongs to.
  const parts = String(query || "")
    .split(",")
    .map((part) => normalize(part))
    .filter(Boolean);

  // Place-level surroundings (a city, a borough, a county) are a stronger
  // signal than the broader state or country.
  const placeContext = normalize(
    [props.locality, props.localadmin, props.borough, props.county]
      .filter(Boolean)
      .join(" "),
  );
  const regionContext = normalize(
    [props.region, props.state, props.country].filter(Boolean).join(" "),
  );

  let score = 0;

  const nameWords = new Set(name.split(" ").filter(Boolean));
  const isNamePart = (part) =>
    !!name && (part === name || part.startsWith(name) || name.startsWith(part));

  let unmatched = 0;

  for (const part of parts) {
    const namePart = isNamePart(part);

    // The surroundings of the place should match the query.
    if (placeContext.includes(part)) score += 100;
    else if (regionContext.includes(part)) score += 25;
    else if (!namePart) unmatched += 1;

    for (const word of part.split(" ")) {
      if (!word || nameWords.has(word)) continue;
      if (placeContext.includes(word)) score += 15;
      else if (regionContext.includes(word)) score += 5;
    }
  }

  // The place name matches a part of the query — the strongest signal, unless
  // the query also named a place the candidate is not in.
  if (name) {
    const exact = parts.some((part) => part === name);
    const loose = parts.some(
      (part) => part.startsWith(name) || name.startsWith(part),
    );
    if (exact) score += unmatched ? 300 : 1000;
    else if (loose) score += unmatched ? 150 : 500;
  }

  // A candidate that ignores the place the user asked for is pushed down.
  score -= unmatched * 200;

  // Prefer the most specific kind of place.
  const layer = props.layer || "";
  score += 100 - (LAYER_PRIORITY[layer] ?? 8) * 5;

  return score;
}

/** Re-order the geocoding response so the best match comes first. */
function rankGeocodeResponse(body, query) {
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return body;
  }
  if (!Array.isArray(payload?.features) || payload.features.length < 2)
    return body;

  const ranked = payload.features
    .map((feature, index) => ({
      feature,
      index,
      score: scoreGeocodeFeature(feature, query),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);

  return JSON.stringify({ ...payload, features: ranked.map((r) => r.feature) });
}

// ORS answers an exhausted free-tier quota with 403 "Quota exceeded", which
// the client reads as a rejected API key. Translate it to 429, the status the
// client turns into the quota message.
function normalizeUpstreamStatus(status, body) {
  if (status === 403 && /quota/i.test(String(body))) return 429;
  return status;
}

const proxy = (pathname, method, incomingQuery, bodyBuf) => {
  const queryString = new URLSearchParams(incomingQuery).toString();
  const fullPath = queryString ? `${pathname}?${queryString}` : pathname;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: ORS_HOST,
        path: fullPath,
        method,
        headers: {
          Authorization: API_KEY || "",
          "Content-Type": "application/json",
          Accept:
            method === "POST" &&
            pathname.startsWith("/openrouteservice/v2/directions")
              ? "application/geo+json,application/json"
              : "application/json",
        },
      },
      (upstream) => {
        const chunks = [];
        upstream.on("data", (c) => chunks.push(c));
        upstream.on("end", () =>
          resolve({
            status: upstream.statusCode || 502,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    if (bodyBuf && bodyBuf.length) req.write(bodyBuf);
    req.end();
  });
};

const readBody = (req) =>
  new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });

export function orsProxyPlugin() {
  return {
    name: "ors-proxy",
    configureServer(server) {
      const logger = server.config.logger;
      if (!API_KEY) {
        logger.warn(
          "[ors-proxy] OPENROUTESERVICE_API_KEY not set — ORS requests will fail.",
        );
      }
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || "";
        if (!url.startsWith("/api/ors/")) return next();

        // Map /api/ors/geocode -> /geocode/search, /api/ors/directions -> /v2/directions/<profile>/geojson
        const tail = url.slice("/api/ors/".length);
        const queryIndex = tail.indexOf("?");
        const pathname = queryIndex === -1 ? tail : tail.slice(0, queryIndex);
        const qs = queryIndex === -1 ? "" : tail.slice(queryIndex + 1);

        if (req.method === "OPTIONS") {
          return send(res, 204, "", {
            "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          });
        }

        if (pathname === "geocode" && req.method === "GET") {
          const params = new URLSearchParams(qs);
          const text = params.get("text");
          if (!text)
            return send(
              res,
              400,
              { error: "Missing ?text=" },
              { "X-Cache": "MISS" },
            );

          const upstreamPath = "/pelias/v1/search";
          // Ask for a few candidates and rank them locally: the upstream order
          // alone puts "Bethpage" (a locality in Nassau County) ahead of
          // "Central Park" in New York County for the query "Central Park, New
          // York". Three results is enough for the ranking and keeps the
          // request cheap against the ORS free-tier quota.
          const upstreamQuery = { text, size: "3" };
          const key = cacheKey(
            "GET",
            upstreamPath,
            new URLSearchParams(upstreamQuery).toString(),
          );

          const cached = cacheGet(key);
          if (cached) {
            logger.info(`[ors-proxy] cache HIT ${upstreamPath} (geocode)`);
            return send(
              res,
              cached.status,
              rankGeocodeResponse(cached.body, text),
              { "X-Cache": "HIT" },
            );
          }
          logger.info(`[ors-proxy] cache MISS ${upstreamPath} (geocode)`);

          try {
            const { status, body } = await proxy(
              upstreamPath,
              "GET",
              upstreamQuery,
            );
            const upstreamStatus = normalizeUpstreamStatus(status, body);
            if (upstreamStatus >= 200 && upstreamStatus < 300) {
              cacheSet(key, CACHE_TTL_GEOCODE_MS, { status, body });
            }
            return send(res, upstreamStatus, rankGeocodeResponse(body, text), {
              "X-Cache": "MISS",
            });
          } catch (err) {
            return send(
              res,
              502,
              { error: "Upstream ORS error", detail: String(err) },
              { "X-Cache": "MISS" },
            );
          }
        }

        if (pathname.startsWith("directions/") && req.method === "POST") {
          const profile = pathname.slice("directions/".length) || "driving-car";
          const buf = await readBody(req);
          if (!buf.length)
            return send(
              res,
              400,
              { error: "Empty body" },
              { "X-Cache": "MISS" },
            );

          const upstreamPath = `/openrouteservice/v2/directions/${profile}/geojson`;
          const key = cacheKey("POST", upstreamPath, "", buf);

          const cached = cacheGet(key);
          if (cached) {
            logger.info(`[ors-proxy] cache HIT ${upstreamPath}`);
            return send(res, cached.status, cached.body, { "X-Cache": "HIT" });
          }
          logger.info(`[ors-proxy] cache MISS ${upstreamPath}`);

          try {
            const { status, body } = await proxy(upstreamPath, "POST", {}, buf);
            const upstreamStatus = normalizeUpstreamStatus(status, body);
            if (upstreamStatus >= 200 && upstreamStatus < 300) {
              cacheSet(key, CACHE_TTL_DIRECTIONS_MS, { status, body });
            }
            return send(res, upstreamStatus, body, { "X-Cache": "MISS" });
          } catch (err) {
            return send(
              res,
              502,
              { error: "Upstream ORS error", detail: String(err) },
              { "X-Cache": "MISS" },
            );
          }
        }

        return send(res, 404, { error: "Unknown /api/ors route" });
      });
    },
  };
}
