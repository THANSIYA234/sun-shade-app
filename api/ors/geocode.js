// Vercel serverless function for GET /api/ors/geocode?text=...
//
// Vercel's file-system API routes every file under api/ by its path, so this
// file owns the /api/ors/geocode route and api/ors/directions/[profile].js
// owns the /api/ors/directions/:profile route. Both delegate to the shared
// proxy core so dev (vite/ors-proxy.js) and production behave identically.
import {
  handleGeocode,
  readQueryParams,
} from "../../server/ors-proxy.js";

export default async function handler(req, res) {
  // Handle browser preflight requests
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "GET") {
    return res
      .status(405)
      .json({ error: "Method not allowed — use GET /api/ors/geocode" });
  }

  const text = readQueryParams(req).get("text");
  const { status, body, headers } = await handleGeocode({ text });

  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null) res.setHeader(name, value);
  }
  return res.status(status).send(body);
}
