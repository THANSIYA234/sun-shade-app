// Dev-time ORS proxy: keeps the API key out of the browser bundle and gives
// the dev server the same /api/ors/* surface that the Vercel functions serve
// in production. Both sides call the shared proxy core (server/ors-proxy.js),
// so the upstream endpoints, the geocoding ranking, the error shapes and the
// cache policy are identical in dev and in production.
/* eslint-env node */
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  handleDirections,
  handleGeocode,
} from "../server/ors-proxy.js";

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

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    ...headers,
  });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
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

      parseEnvFile(path.resolve(process.cwd(), ".env"));

      if (!process.env.OPENROUTESERVICE_API_KEY) {
        logger.warn(
          "[ors-proxy] OPENROUTESERVICE_API_KEY not set — ORS requests will fail.",
        );
      }

      server.middlewares.use(async (req, res, next) => {
        const url = req.url || "";
        if (!url.startsWith("/api/ors/")) return next();

        // Map /api/ors/geocode -> geocode, /api/ors/directions/<profile> ->
        // directions/<profile>, matching the Vercel function routes.
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
          const text = new URLSearchParams(qs).get("text");
          const { status, body, headers } = await handleGeocode({ text });
          logger.info(`[ors-proxy] geocode ${headers["X-Cache"]}`);
          return send(res, status, body, headers);
        }

        if (pathname.startsWith("directions/") && req.method === "POST") {
          const profile = pathname.slice("directions/".length);
          const buf = await readBody(req);
          const { status, body, headers } = await handleDirections({
            profile,
            body: buf.toString("utf8"),
          });
          logger.info(`[ors-proxy] directions ${headers["X-Cache"]}`);
          return send(res, status, body, headers);
        }

        return send(res, 404, { error: "Unknown /api/ors route" });
      });
    },
  };
}
