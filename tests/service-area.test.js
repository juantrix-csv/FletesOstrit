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
});

test('service-area validates coordinates', async () => {
  const req = { method: 'GET', query: { lat: 'x', lng: '-57.95' } };
  const res = createRes();
  await handler(req, res);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Missing coordinates' });
});

test('service-area always returns the circular reference without fetching routes', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.MAPBOX_ACCESS_TOKEN;
  process.env.MAPBOX_ACCESS_TOKEN = 'test-key';
  globalThis.fetch = () => {
    throw new Error('Service area must not request an external route');
  };

  try {
    const req = { method: 'GET', query: { lat: '-34.9444163', lng: '-57.9535838', minutes: '15' } };
    const res = createRes();
    await handler(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.minutes, 15);
    assert.equal(res.body.source, 'approximate');
    assert.equal(res.body.geometry.type, 'Polygon');
    const ring = res.body.geometry.coordinates[0];
    assert.equal(ring.length, 97);
    assert.deepEqual(ring[0], ring.at(-1));

    const center = [-57.9535838, -34.9444163];
    const distances = ring.slice(0, -1).map(([lng, lat]) => {
      const latDelta = (lat - center[1]) * Math.PI / 180;
      const lngDelta = (lng - center[0]) * Math.PI / 180;
      const meanLat = (lat + center[1]) * Math.PI / 360;
      return 6371008.8 * Math.hypot(latDelta, lngDelta * Math.cos(meanLat));
    });
    assert.ok(distances.every((distance) => Math.abs(distance - 8750) < 20));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey == null) delete process.env.MAPBOX_ACCESS_TOKEN;
    else process.env.MAPBOX_ACCESS_TOKEN = originalApiKey;
  }
});
