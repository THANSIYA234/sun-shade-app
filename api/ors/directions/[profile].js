// Vercel serverless function for POST /api/ors/directions/:profile
//
// The routing profile is a single dynamic path segment, which Vercel exposes
// as the "profile" query parameter. The shared proxy core validates it against
// the allow-list of profiles the app supports.
import {
  handleDirections,
  readBodyText,
  readProfile,
} from "../../../server/ors-proxy.js";

export default async function handler(req, res) {
  // Handle browser preflight requests
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ error: "Method not allowed — use POST /api/ors/directions/:profile" });
  }

  const profile = readProfile(req);
  const body = readBodyText(req);
  const { status, body: responseBody, headers } = await handleDirections({
    profile,
    body,
  });

  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && value !== null) res.setHeader(name, value);
  }
  return res.status(status).send(responseBody);
}
