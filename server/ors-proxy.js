// Shared OpenRouteService proxy core.
//
// Both the Vite dev middleware (vite/ors-proxy.js) and the Vercel serverless
// functions (api/ors/**) call into this module, so the browser bundle never
// sees the API key and dev/production behave identically: same upstream
// endpoints, same geocoding ranking, same error shapes, same cache policy.
/* eslint-env node */
import { createHash } from "node:crypto";

const ORS_HOST = "api.heigit.org";

// The key is read on every request (not cached at module load) so the dev
// server can pick up .env after this module is imported, and so the serverless
// functions always read the current environment. It is only ever read from
// process.env.OPENROUTESERVICE_API_KEY — never from a VITE_ variable, which
// Vite would inline into the browser bundle.
const apiKey = () => process.env.OPENROUTESERVICE_API_KEY || "";

export const ALLOWED_PROFILES = [
  "driving-car",
  "cycling-regular",
  "foot-walking",
];

// --- TTL cache ---------------------------------------------------------------
// The proxy is hit repeatedly while the user tweaks the form, and ORS has a
// tight free-tier quota, so identical upstream requests are memoised in memory.
// Entries carry their own expiry (TTL) and the map is capped so it cannot grow
// without bound; the oldest entry is dropped once the cap is exceeded.
const CACHE_MAX_ENTRIES = 200;
export const CACHE_TTL_GEOCODE_MS = 24 * 60 * 60 * 1000; // 24 h — addresses barely change.
export const CACHE_TTL_DIRECTIONS_MS = 10 * 60 * 1000; // 10 min — routes depend on live traffic.

// The in-memory cache above only survives while a process lives. On Vercel
// each serverless instance has its own memory, so successful geocoding
// responses are also marked cacheable at the CDN for the same TTL. That keeps
// the ORS free-tier quota protected in production, not just in dev.
const CDN_CACHE_GEOCODE = `public, s-maxage=${CACHE_TTL_GEOCODE_MS / 1000}, stale-while-revalidate=600`;

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
  // Beyond the cap: drop the oldest (Map keeps insertion order).
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

const json = (status, payload, headers = {}) => ({
  status,
  body: JSON.stringify(payload),
  headers: { "Content-Type": "application/json", ...headers },
});

const isSuccess = (status) => status >= 200 && status < 300;

/**
 * Query parameters of the incoming request.
 *
 * The serverless runtime parses them into req.query, but the raw URL is
 * authoritative, so both are read and the URL wins.
 */
export function readQueryParams(req) {
  const params = new URLSearchParams();

  const raw = typeof req.url === "string" ? req.url : "";
  const index = raw.indexOf("?");
  if (index !== -1) {
    for (const [key, value] of new URLSearchParams(raw.slice(index + 1))) {
      params.set(key, value);
    }
  }

  if (req.query && typeof req.query === "object") {
    for (const [key, value] of Object.entries(req.query)) {
      const single = Array.isArray(value) ? value[0] : value;
      if (typeof single === "string" && !params.has(key)) {
        params.set(key, single);
      }
    }
  }

  return params;
}

/**
 * The routing profile of a directions request.
 *
 * The runtime exposes a dynamic path segment as a query parameter, and the
 * original URL still carries it. Both are read, and the URL wins: the path is
 * what actually selects the route, so a query parameter must not be able to
 * point it somewhere else. Only a profile on the allow-list is returned —
 * anything else (a leftover route placeholder, a traversal attempt) yields
 * null and is rejected as an invalid profile.
 */
export function readProfile(req) {
  const candidates = [];

  const raw = typeof req.url === "string" ? req.url : "";
  const match = raw.match(/\/directions\/([^/?#]+)/);
  if (match) {
    candidates.push(decodeURIComponent(match[1]));
  }

  const fromQuery = req.query?.profile;
  if (typeof fromQuery === "string") {
    candidates.push(fromQuery);
  } else if (Array.isArray(fromQuery) && typeof fromQuery[0] === "string") {
    candidates.push(fromQuery[0]);
  }

  for (const candidate of candidates) {
    const profile = candidate.replace(/\.js$/, "");
    if (ALLOWED_PROFILES.includes(profile)) return profile;
  }

  return null;
}

/** The request body as text, whichever way the runtime parsed it. */
export function readBodyText(req) {
  const body = req.body;
  if (typeof body === "string") return body;
  if (body === undefined || body === null) return "";
  if (Buffer.isBuffer(body)) return body.toString("utf8");
  return JSON.stringify(body);
}

/** Call OpenRouteService and return the raw status plus the body text. */
async function callUpstream(upstreamPath, { method, query, body, accept }) {
  const url = new URL(`https://${ORS_HOST}${upstreamPath}`);
  for (const [key, value] of Object.entries(query || {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: apiKey(),
      "Content-Type": "application/json",
      Accept: accept || "application/json",
    },
    ...(body ? { body } : {}),
  });

  return { status: response.status, body: await response.text() };
}

/**
 * Geocode a free-text place name.
 *
 * Returns { status, body, headers } where body is the raw upstream JSON text
 * (already re-ranked so the best match comes first).
 */
export async function handleGeocode({ text }) {
  if (!apiKey()) {
    return json(500, { error: "OPENROUTESERVICE_API_KEY is not configured" });
  }

  if (!text) {
    return json(400, { error: "Missing ?text=" }, { "X-Cache": "MISS" });
  }

  // Ask for a few candidates and rank them locally: the upstream order alone
  // puts "Bethpage" (a locality in Nassau County) ahead of "Central Park" in
  // New York County for the query "Central Park, New York". Three results is
  // enough for the ranking and keeps the request cheap against the ORS
  // free-tier quota.
  const upstreamQuery = { text, size: "3" };
  const upstreamPath = "/pelias/v1/search";
  const queryString = new URLSearchParams(upstreamQuery).toString();
  const key = cacheKey("GET", upstreamPath, queryString);

  const cached = cacheGet(key);
  if (cached) {
    return {
      status: cached.status,
      body: rankGeocodeResponse(cached.body, text),
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "HIT",
        ...(isSuccess(cached.status)
          ? { "Cache-Control": CDN_CACHE_GEOCODE }
          : {}),
      },
    };
  }

  try {
    const { status, body } = await callUpstream(upstreamPath, {
      method: "GET",
      query: upstreamQuery,
    });
    const upstreamStatus = normalizeUpstreamStatus(status, body);
    if (upstreamStatus >= 200 && upstreamStatus < 300) {
      cacheSet(key, CACHE_TTL_GEOCODE_MS, { status, body });
    }
    return {
      status: upstreamStatus,
      body: rankGeocodeResponse(body, text),
      headers: {
        "Content-Type": "application/json",
        "X-Cache": "MISS",
        // Only successful responses are cacheable — an upstream error must not
        // be pinned at the CDN for a day.
        ...(isSuccess(upstreamStatus) ? { "Cache-Control": CDN_CACHE_GEOCODE } : {}),
      },
    };
  } catch (error) {
    return json(
      502,
      { error: "Unable to connect to OpenRouteService", detail: String(error) },
      { "X-Cache": "MISS" },
    );
  }
}

/**
 * Fetch a route for the given profile and body.
 *
 * The body is the ORS request payload (already-serialised JSON). Returns
 * { status, body, headers } where body is the raw upstream response text.
 */
export async function handleDirections({ profile, body }) {
  if (!apiKey()) {
    return json(500, { error: "OPENROUTESERVICE_API_KEY is not configured" });
  }

  if (!ALLOWED_PROFILES.includes(profile)) {
    return json(400, { error: "Invalid routing profile" });
  }

  if (!body) {
    return json(400, { error: "Empty body" });
  }

  const upstreamPath = `/openrouteservice/v2/directions/${profile}/geojson`;
  const key = cacheKey("POST", upstreamPath, "", body);

  const cached = cacheGet(key);
  if (cached) {
    return {
      status: cached.status,
      body: cached.body,
      headers: { "Content-Type": "application/json", "X-Cache": "HIT" },
    };
  }

  try {
    const { status, body: upstreamBody } = await callUpstream(upstreamPath, {
      method: "POST",
      body,
      accept: "application/geo+json,application/json",
    });
    const upstreamStatus = normalizeUpstreamStatus(status, upstreamBody);
    if (upstreamStatus >= 200 && upstreamStatus < 300) {
      cacheSet(key, CACHE_TTL_DIRECTIONS_MS, { status, body: upstreamBody });
    }
    return {
      status: upstreamStatus,
      body: upstreamBody,
      // Directions is a POST, which Vercel's CDN does not cache; the TTL cache
      // above is what protects the ORS quota here.
      headers: { "Content-Type": "application/json", "X-Cache": "MISS" },
    };
  } catch (error) {
    return json(
      502,
      { error: "Unable to connect to OpenRouteService", detail: String(error) },
      { "X-Cache": "MISS" },
    );
  }
}
