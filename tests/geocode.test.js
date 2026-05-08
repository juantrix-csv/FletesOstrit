import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/geocode.js';

const createRes = () => ({
  statusCode: 200,
  body: undefined,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
  send(payload) {
    this.body = payload;
    return this;
  },
});

test('geocode prefers OpenStreetMap by default even when Mapbox is configured', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.MAPBOX_ACCESS_TOKEN;
  const originalMapboxEnabled = process.env.MAPBOX_ENABLED;
  const originalPreference = process.env.PREFER_OPEN_MAPS;
  process.env.MAPBOX_ENABLED = 'true';
  process.env.MAPBOX_ACCESS_TOKEN = 'test-key';
  delete process.env.PREFER_OPEN_MAPS;

  let fetchCount = 0;
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    fetchCount += 1;
    requestedUrls.push(String(url));
    return {
      ok: true,
      json: async () => ([{
        place_id: 123,
        display_name: 'Calle 12, La Plata',
        lat: '-34.92000',
        lon: '-57.95000',
      }]),
    };
  };

  const req = { method: 'GET', query: { q: 'Calle 12' } };
  const res = createRes();
  await handler(req, res);

  globalThis.fetch = originalFetch;
  if (originalApiKey == null) {
    delete process.env.MAPBOX_ACCESS_TOKEN;
  } else {
    process.env.MAPBOX_ACCESS_TOKEN = originalApiKey;
  }
  if (originalMapboxEnabled == null) {
    delete process.env.MAPBOX_ENABLED;
  } else {
    process.env.MAPBOX_ENABLED = originalMapboxEnabled;
  }
  if (originalPreference == null) {
    delete process.env.PREFER_OPEN_MAPS;
  } else {
    process.env.PREFER_OPEN_MAPS = originalPreference;
  }

  assert.equal(fetchCount, 1);
  assert.match(requestedUrls[0], /nominatim\.openstreetmap\.org/);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [{
    place_id: 123,
    display_name: 'Calle 12, La Plata',
    lat: '-34.92000',
    lon: '-57.95000',
  }]);
});

test('geocode uses OpenStreetMap fallback when Mapbox is primary and quota is exhausted', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.MAPBOX_ACCESS_TOKEN;
  const originalMapboxEnabled = process.env.MAPBOX_ENABLED;
  const originalPreference = process.env.PREFER_OPEN_MAPS;
  process.env.MAPBOX_ENABLED = 'true';
  process.env.MAPBOX_ACCESS_TOKEN = 'test-key';
  process.env.PREFER_OPEN_MAPS = 'false';

  let fetchCount = 0;
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    fetchCount += 1;
    requestedUrls.push(String(url));
    if (fetchCount === 1) {
      return {
        ok: false,
        status: 429,
        json: async () => ({ message: 'Rate limit exceeded' }),
      };
    }
    return {
      ok: true,
      json: async () => ([{
        place_id: 123,
        display_name: 'Calle 12, La Plata',
        lat: '-34.92000',
        lon: '-57.95000',
      }]),
    };
  };

  const req = { method: 'GET', query: { q: 'Calle 12' } };
  const res = createRes();
  await handler(req, res);

  globalThis.fetch = originalFetch;
  if (originalApiKey == null) {
    delete process.env.MAPBOX_ACCESS_TOKEN;
  } else {
    process.env.MAPBOX_ACCESS_TOKEN = originalApiKey;
  }
  if (originalMapboxEnabled == null) {
    delete process.env.MAPBOX_ENABLED;
  } else {
    process.env.MAPBOX_ENABLED = originalMapboxEnabled;
  }
  if (originalPreference == null) {
    delete process.env.PREFER_OPEN_MAPS;
  } else {
    process.env.PREFER_OPEN_MAPS = originalPreference;
  }

  assert.equal(fetchCount, 2);
  assert.match(requestedUrls[0], /api\.mapbox\.com/);
  assert.match(requestedUrls[1], /nominatim\.openstreetmap\.org/);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [{
    place_id: 123,
    display_name: 'Calle 12, La Plata',
    lat: '-34.92000',
    lon: '-57.95000',
  }]);
});
