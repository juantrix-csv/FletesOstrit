import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/route.js';

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

test('route uses OpenStreetMap fallback when Mapbox token is missing', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.MAPBOX_ACCESS_TOKEN;
  delete process.env.MAPBOX_ACCESS_TOKEN;

  let fetchCount = 0;
  globalThis.fetch = async () => {
    fetchCount += 1;
    return {
      ok: true,
      json: async () => ({
        routes: [{
          geometry: {
            type: 'LineString',
            coordinates: [[-57.95, -34.92], [-57.96, -34.93]],
          },
          distance: 1520.4,
          duration: 410.2,
        }],
      }),
    };
  };

  const req = { method: 'GET', query: { points: '-34.92,-57.95|-34.93,-57.96' } };
  const res = createRes();
  await handler(req, res);

  globalThis.fetch = originalFetch;
  if (originalApiKey == null) {
    delete process.env.MAPBOX_ACCESS_TOKEN;
  } else {
    process.env.MAPBOX_ACCESS_TOKEN = originalApiKey;
  }

  assert.equal(fetchCount, 1);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    geometry: {
      type: 'LineString',
      coordinates: [[-57.95, -34.92], [-57.96, -34.93]],
    },
    distanceMeters: 1520.4,
    durationSeconds: 410.2,
  });
});
