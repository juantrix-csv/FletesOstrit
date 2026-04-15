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

test('geocode uses OpenStreetMap fallback when Mapbox quota is exhausted', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.MAPBOX_ACCESS_TOKEN;
  const originalMapboxEnabled = process.env.MAPBOX_ENABLED;
  process.env.MAPBOX_ENABLED = 'true';
  process.env.MAPBOX_ACCESS_TOKEN = 'test-key';

  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
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

  assert.equal(fetchCount, 2);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [{
    place_id: 123,
    display_name: 'Calle 12, La Plata',
    lat: '-34.92000',
    lon: '-57.95000',
  }]);
});
