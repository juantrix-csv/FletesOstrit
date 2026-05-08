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
  const originalPreference = process.env.PREFER_OPEN_MAPS;
  delete process.env.MAPBOX_ACCESS_TOKEN;
  delete process.env.PREFER_OPEN_MAPS;

  let fetchCount = 0;
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    fetchCount += 1;
    requestedUrls.push(String(url));
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
  if (originalPreference == null) {
    delete process.env.PREFER_OPEN_MAPS;
  } else {
    process.env.PREFER_OPEN_MAPS = originalPreference;
  }

  assert.equal(fetchCount, 1);
  assert.match(requestedUrls[0], /router\.project-osrm\.org/);
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

test('route can still use Mapbox when OpenStreetMap is not preferred', async () => {
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
    return {
      ok: true,
      json: async () => ({
        routes: [{
          geometry: {
            type: 'LineString',
            coordinates: [[-57.95, -34.92], [-57.96, -34.93]],
          },
          distance: 1800,
          duration: 520,
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
  assert.match(requestedUrls[0], /api\.mapbox\.com/);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    geometry: {
      type: 'LineString',
      coordinates: [[-57.95, -34.92], [-57.96, -34.93]],
    },
    distanceMeters: 1800,
    durationSeconds: 520,
  });
});

test('route falls back to OpenStreetMap when Mapbox fails', async () => {
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
        json: async () => ({ message: 'upstream failure' }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        routes: [{
          geometry: {
            type: 'LineString',
            coordinates: [[-57.95, -34.92], [-57.96, -34.93]],
          },
          distance: 2100,
          duration: 610,
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
  assert.match(requestedUrls[1], /router\.project-osrm\.org/);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.distanceMeters, 2100);
  assert.equal(res.body.durationSeconds, 610);
});
