import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

import {
  handleDirections,
  handleGeocode,
  readBodyText,
  readProfile,
  readQueryParams,
} from './ors-proxy.js';
import geocodeHandler from '../api/ors/geocode.js';
import directionsHandler from '../api/ors/directions/[profile].js';

const ORIGIN = { 'content-type': 'application/json' };

const jsonResponse = (body, { status = 200 } = {}) => ({
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.stubEnv('OPENROUTESERVICE_API_KEY', 'test-key');
});

describe('readQueryParams', () => {
  it('reads parameters from the request URL', () => {
    const params = readQueryParams({ url: '/api/ors/geocode?text=mumbai&size=3' });
    expect(params.get('text')).toBe('mumbai');
    expect(params.get('size')).toBe('3');
  });

  it('falls back to the parsed query object', () => {
    const params = readQueryParams({
      url: '/api/ors/geocode',
      query: { text: 'mumbai' },
    });
    expect(params.get('text')).toBe('mumbai');
  });
});

describe('readProfile', () => {
  it('reads the profile from the dynamic segment query parameter', () => {
    expect(readProfile({ query: { profile: 'driving-car' } })).toBe('driving-car');
  });

  it('reads the profile from the request path', () => {
    expect(readProfile({ url: '/api/ors/directions/cycling-regular' })).toBe(
      'cycling-regular',
    );
  });

  it('rejects a profile that is not on the allow-list', () => {
    expect(readProfile({ query: { profile: 'evil/../admin' } })).toBeNull();
    expect(readProfile({ query: { profile: 'not-a-profile' } })).toBeNull();
  });

  it('prefers the path segment over the query parameter', () => {
    expect(
      readProfile({
        url: '/api/ors/directions/driving-car',
        query: { profile: 'foot-walking' },
      }),
    ).toBe('driving-car');
  });

  it('ignores a route placeholder left in the path', () => {
    expect(
      readProfile({
        url: '/api/ors/directions/[profile].js',
        query: { profile: 'driving-car' },
      }),
    ).toBe('driving-car');
  });
});

describe('readBodyText', () => {
  it('returns a string body unchanged', () => {
    expect(readBodyText({ body: '{"a":1}' })).toBe('{"a":1}');
  });

  it('serialises an object body', () => {
    expect(readBodyText({ body: { a: 1 } })).toBe('{"a":1}');
  });

  it('returns an empty string for a missing body', () => {
    expect(readBodyText({})).toBe('');
  });
});

describe('handleGeocode', () => {
  it('forwards the search text to the ORS geocoder', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ features: [{ geometry: { coordinates: [72.87, 19.07] } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleGeocode({ text: 'mumbai' });

    expect(result.status).toBe(200);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/pelias/v1/search');
    expect(String(url)).toContain('text=mumbai');
    expect(options.headers.Authorization).toBe('test-key');
  });

  it('rejects a request without search text before calling ORS', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleGeocode({ text: '' });

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/text/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails with a clear error when the API key is missing', async () => {
    vi.stubEnv('OPENROUTESERVICE_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleGeocode({ text: 'mumbai' });

    expect(result.status).toBe(500);
    expect(JSON.parse(result.body).error).toMatch(/OPENROUTESERVICE_API_KEY/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reorders candidates so the best match comes first', async () => {
    const payload = {
      features: [
        {
          properties: { name: 'Bethpage', layer: 'locality', county: 'Nassau County' },
          geometry: { coordinates: [-73.72, 40.74] },
        },
        {
          properties: { name: 'Central Park', layer: 'venue', locality: 'New York' },
          geometry: { coordinates: [-73.96, 40.78] },
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(payload)));

    const result = await handleGeocode({ text: 'Central Park, New York' });

    const ranked = JSON.parse(result.body);
    expect(ranked.features[0].properties.name).toBe('Central Park');
  });

  it('reports an exhausted free-tier quota as 429, not 403', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'Quota exceeded' }, { status: 403 })),
    );

    // A distinct search text: the proxy caches successful lookups by query,
    // so reusing "mumbai" here would hit an earlier test's cached entry.
    const result = await handleGeocode({ text: 'quota probe' });

    expect(result.status).toBe(429);
  });

  it('serves a repeated search from the cache', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ features: [{ geometry: { coordinates: [1, 2] } }] }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await handleGeocode({ text: 'cache probe' });
    const second = await handleGeocode({ text: 'cache probe' });

    expect(second.headers['X-Cache']).toBe('HIT');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('handleDirections', () => {
  it('forwards the route to the matching ORS profile', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ features: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleDirections({
      profile: 'driving-car',
      body: '{"coordinates":[[72.87,19.07],[72.88,19.08]]}',
    });

    expect(result.status).toBe(200);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/openrouteservice/v2/directions/driving-car/geojson');
    expect(options.method).toBe('POST');
    expect(options.body).toContain('coordinates');
  });

  it('refuses a profile that is not on the allow-list', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleDirections({
      profile: 'not-a-profile',
      body: '{"coordinates":[]}',
    });

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body).error).toMatch(/profile/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an empty request body', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await handleDirections({ profile: 'driving-car', body: '' });

    expect(result.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('passes the upstream status through to the caller', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'nope' }, { status: 400 })),
    );

    const result = await handleDirections({
      profile: 'driving-car',
      body: '{"coordinates":[[1,2],[3,4]]}',
    });

    expect(result.status).toBe(400);
  });
});

describe('Vercel functions', () => {
  const createRes = () => {
    const headers = {};
    return {
      statusCode: 200,
      body: undefined,
      headers,
      setHeader(name, value) {
        if (value === undefined || value === null) {
          // Node throws ERR_HTTP_INVALID_HEADER_VALUE for these.
          throw new TypeError(`Invalid value for header "${name}"`);
        }
        headers[name] = value;
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      send(payload) {
        this.body = payload;
        return this;
      },
      json(payload) {
        this.body = JSON.stringify(payload);
        return this;
      },
      end() {
        return this;
      },
    };
  };

  it('serves geocoding with the cache headers intact', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ features: [{ geometry: { coordinates: [72.87, 19.07] } }] }),
      ),
    );

    const res = createRes();
    await geocodeHandler(
      {
        method: 'GET',
        url: '/api/ors/geocode?text=function%20probe',
        query: {},
      },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/json');
    expect(res.headers['X-Cache']).toBe('MISS');
    // The CDN cache header is what protects the ORS quota in production.
    expect(res.headers['Cache-Control']).toMatch(/s-maxage=\d+/);
    expect(JSON.parse(res.body).features).toHaveLength(1);
  });

  it('reports a missing API key without throwing', async () => {
    vi.stubEnv('OPENROUTESERVICE_API_KEY', '');

    const res = createRes();
    await geocodeHandler(
      { method: 'GET', url: '/api/ors/geocode?text=mumbai', query: {} },
      res,
    );

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body).error).toMatch(/OPENROUTESERVICE_API_KEY/);
  });

  it('rejects a non-GET request to the geocoding endpoint', async () => {
    const res = createRes();
    await geocodeHandler({ method: 'POST', url: '/api/ors/geocode', query: {} }, res);

    expect(res.statusCode).toBe(405);
  });

  it('serves directions and forwards the profile from the path', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ features: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const res = createRes();
    await directionsHandler(
      {
        method: 'POST',
        url: '/api/ors/directions/driving-car',
        query: { profile: 'driving-car' },
        body: '{"coordinates":[[10.1,20.2],[10.3,20.4]]}',
      },
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/json');
    expect(res.headers['X-Cache']).toBe('MISS');
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/directions/driving-car/geojson');
  });

  it('rejects an unknown routing profile', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const res = createRes();
    await directionsHandler(
      {
        method: 'POST',
        url: '/api/ors/directions/not-a-profile',
        query: { profile: 'not-a-profile' },
        body: '{"coordinates":[]}',
      },
      res,
    );

    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers a preflight request', async () => {
    const res = createRes();
    await geocodeHandler({ method: 'OPTIONS', url: '/api/ors/geocode', query: {} }, res);

    expect(res.statusCode).toBe(204);
  });
});
