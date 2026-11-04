import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  DEFAULT_PROFILE,
  friendlyError,
  getRoute,
  parseRouteResponse,
} from './Routes.js';

const ORS_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [-73.9654, 40.7829],
          [-73.9877, 40.758],
          [-73.9855, 40.7527],
        ],
      },
      properties: {
        summary: { distance: 4275.5, duration: 543.3 },
      },
    },
  ],
};

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({
  ok,
  status,
  json: async () => body,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseRouteResponse', () => {
  it('maps ORS geojson to lat/lng coords with distance and duration', () => {
    expect(parseRouteResponse(ORS_GEOJSON)).toEqual({
      coords: [
        [40.7829, -73.9654],
        [40.758, -73.9877],
        [40.7527, -73.9855],
      ],
      distanceMeters: 4275.5,
      durationSeconds: 543.3,
    });
  });

  it('rejects a response without a usable line', () => {
    expect(() => parseRouteResponse({ features: [] })).toThrow(/Route not found/);
    expect(() =>
      parseRouteResponse({ features: [{ geometry: { coordinates: [[1, 2]] } }] }),
    ).toThrow(/Route not found/);
  });
});

describe('friendlyError', () => {
  it('maps upstream statuses to distinct actionable messages', () => {
    const forbidden = friendlyError(403, { error: 'quota' });
    const limited = friendlyError(429, { error: 'rate limit' });
    const server = friendlyError(500, { error: 'boom' });

    expect(forbidden).toBe(
      'OpenRouteService rejected the request — check OPENROUTESERVICE_API_KEY in .env.',
    );
    expect(limited).toBe('OpenRouteService free-tier limit reached. Try again later.');
    expect(server).toBe('OpenRouteService error (HTTP 500).');

    expect(new Set([forbidden, limited, server]).size).toBe(3);
  });
});

describe('getRoute', () => {
  it('posts lng/lat coordinates to the directions proxy', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/geocode')) {
        return jsonResponse({
          features: [{ geometry: { coordinates: [-73.9654, 40.7829] } }],
        });
      }
      return jsonResponse(ORS_GEOJSON);
    });
    vi.stubGlobal('fetch', fetchMock);

    const route = await getRoute('Central Park, New York', 'Times Square, New York');

    expect(DEFAULT_PROFILE).toBe('driving-car');
    expect(route.distanceMeters).toBe(4275.5);
    expect(route.durationSeconds).toBe(543.3);

    const directionsCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/directions/'),
    );
    expect(directionsCall).toBeDefined();
    const [url, options] = directionsCall;
    expect(url).toBe('/api/ors/directions/driving-car');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      coordinates: [
        [-73.9654, 40.7829],
        [-73.9654, 40.7829],
      ],
    });
  });

  it('surfaces a friendly message when the proxy cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );

    await expect(getRoute('a', 'b')).rejects.toThrow(
      'Could not reach the API. Is the dev server running?',
    );
  });
});
