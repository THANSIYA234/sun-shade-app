// Calls the local /api/ors/* proxy (see vite/ors-proxy.js). The ORS API key
// is read on the server side and never reaches the browser bundle.

const PROXY_BASE = '/api/ors';

export const DEFAULT_PROFILE = 'driving-car';

const NETWORK_ERROR = 'Could not reach the API. Is the dev server running?';

/**
 * Map an upstream ORS status onto a message a user can act on.
 * The raw upstream body is kept in the server log only.
 */
export function friendlyError(status, body) {
  console.error(`[ORS ${status}]`, body);

  switch (status) {
    case 403:
      return 'OpenRouteService rejected the request — check OPENROUTESERVICE_API_KEY in .env.';
    case 429:
      return 'OpenRouteService free-tier limit reached. Try again later.';
    case 400:
      return 'OpenRouteService could not parse the request.';
    case 404:
      return 'No route found between these points.';
    default:
      return `OpenRouteService error (HTTP ${status}).`;
  }
}

async function readError(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = res.statusText || `HTTP ${res.status}`;
  }
  return new Error(friendlyError(res.status, body));
}

/** Fetch JSON from the proxy, translating network and HTTP failures. */
async function requestJson(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    console.error('[ORS] network failure', err);
    throw new Error(NETWORK_ERROR);
  }

  if (!res.ok) throw await readError(res);

  try {
    return await res.json();
  } catch (err) {
    console.error('[ORS] unreadable response', err);
    throw new Error('Could not read the OpenRouteService response.');
  }
}

/** Geocode a free-text place name to [lng, lat] (ORS returns lng-lat order). */
export async function geocode(location) {
  if (!location?.trim()) {
    throw new Error('Empty location');
  }
  const url = `${PROXY_BASE}/geocode?text=${encodeURIComponent(location)}`;
  const data = await requestJson(url, { headers: { Accept: 'application/json' } });

  const feature = data?.features?.[0];
  if (!feature) throw new Error(`No match for "${location}"`);
  return feature.geometry.coordinates;
}

/**
 * Map an ORS directions geojson response to the route shape the app uses:
 * { coords: [[lat, lng], ...], distanceMeters, durationSeconds }.
 */
export function parseRouteResponse(data) {
  const lineFeature = data?.features?.[0];
  const lineCoords = lineFeature?.geometry?.coordinates;
  if (!Array.isArray(lineCoords) || lineCoords.length < 2) {
    throw new Error('Route not found between these points');
  }

  const summary = lineFeature?.properties?.summary ?? {};

  // ORS geojson is [lng, lat]; the app works in [lat, lng] order.
  return {
    coords: lineCoords.map(([lng, lat]) => [lat, lng]),
    distanceMeters: Number(summary.distance) || 0,
    durationSeconds: Number(summary.duration) || 0,
  };
}

/**
 * Get a driving route from startPoint -> endPoint. Returns
 * { coords, distanceMeters, durationSeconds }.
 */
export async function getRoute(startPoint, endPoint, profile = DEFAULT_PROFILE) {
  const [startLngLat, endLngLat] = await Promise.all([
    geocode(startPoint),
    geocode(endPoint),
  ]);

  const data = await requestJson(`${PROXY_BASE}/directions/${profile}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/geo+json' },
    body: JSON.stringify({ coordinates: [startLngLat, endLngLat] }),
  });

  return parseRouteResponse(data);
}
