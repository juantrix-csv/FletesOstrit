import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/service-area.js';

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

test('service-area validates coordinates', async () => {
  const req = { method: 'GET', query: { lat: 'x', lng: '-57.95' } };
  const res = createRes();
  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Missing coordinates' });
});

test('service-area returns approximate area when Mapbox token is missing', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.MAPBOX_ACCESS_TOKEN;
  delete process.env.MAPBOX_ACCESS_TOKEN;

  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    throw new Error('fetch should not be called');
  };

  const req = { method: 'GET', query: { lat: '-34.9444163', lng: '-57.9535838', minutes: '15' } };
  const res = createRes();
  await handler(req, res);

  globalThis.fetch = originalFetch;
  if (originalApiKey == null) {
    delete process.env.MAPBOX_ACCESS_TOKEN;
  } else {
    process.env.MAPBOX_ACCESS_TOKEN = originalApiKey;
  }

  assert.equal(fetchCount, 0);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.minutes, 15);
  assert.equal(res.body.source, 'approximate');
  assert.equal(res.body.geometry.type, 'Polygon');
  assert.equal(res.body.geometry.coordinates[0].length, 97);
});

test('service-area returns Mapbox isochrone geometry when available', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.MAPBOX_ACCESS_TOKEN;
  const originalMapboxEnabled = process.env.MAPBOX_ENABLED;
  process.env.MAPBOX_ENABLED = 'true';
  process.env.MAPBOX_ACCESS_TOKEN = 'test-key';

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      features: [{
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        },
      }],
    }),
  });

  const req = { method: 'GET', query: { lat: '-34.9444163', lng: '-57.9535838', minutes: '15' } };
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

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.source, 'mapbox');
  assert.deepEqual(res.body.geometry, {
    type: 'Polygon',
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
  });
});
