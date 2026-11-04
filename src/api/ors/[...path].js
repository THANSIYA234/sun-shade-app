const ORS_HOST = "api.heigit.org";

export default async function handler(req, res) {
  // Handle browser preflight requests
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const API_KEY = process.env.OPENROUTESERVICE_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({
      error: "OPENROUTESERVICE_API_KEY is not configured",
    });
  }

  try {
    // Read the path after /api/ors/
    const url = new URL(req.url, `https://${req.headers.host}`);
    const path = url.pathname.replace("/api/ors/", "");

    let upstreamPath;
    let method = req.method;
    let body;

    // Geocoding
    if (path === "geocode" && method === "GET") {
      const text = url.searchParams.get("text");

      if (!text) {
        return res.status(400).json({
          error: "Missing search text",
        });
      }

      const params = new URLSearchParams({
        text,
        size: "3",
      });

      upstreamPath = `/pelias/v1/search?${params.toString()}`;
    }

    // Directions
    else if (path.startsWith("directions/") && method === "POST") {
      const profile = path.split("/")[1];

      const allowedProfiles = [
        "driving-car",
        "cycling-regular",
        "foot-walking",
      ];

      if (!allowedProfiles.includes(profile)) {
        return res.status(400).json({
          error: "Invalid routing profile",
        });
      }

      upstreamPath = `/openrouteservice/v2/directions/${profile}/geojson`;

      body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    } else {
      return res.status(404).json({
        error: "Unknown ORS endpoint",
      });
    }

    // Forward request to OpenRouteService
    const upstream = await fetch(`https://${ORS_HOST}${upstreamPath}`, {
      method,
      headers: {
        Authorization: API_KEY,
        "Content-Type": "application/json",
        Accept:
          method === "POST"
            ? "application/geo+json,application/json"
            : "application/json",
      },
      ...(body ? { body } : {}),
    });

    const responseText = await upstream.text();

    res.setHeader("Content-Type", "application/json");

    return res.status(upstream.status).send(responseText);
  } catch (error) {
    console.error("ORS proxy error:", error);

    return res.status(502).json({
      error: "Unable to connect to OpenRouteService",
      detail: error.message,
    });
  }
}
