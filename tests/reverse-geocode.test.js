import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/reverse-geocode.js';

const createRes = () => {
  const res = {
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
  };
  return res;
};

test('reverse-geocode rejects non-GET methods', async () => {
  const req = { method: 'POST' };
  const res = createRes();
  await handler(req, res);
  assert.equal(res.statusCode, 405);
  assert.deepEqual(res.body, { error: 'Method not allowed' });
});

test('reverse-geocode validates coordinates', async () => {
  const req = { method: 'GET', query: {} };
  const res = createRes();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Missing coordinates' });
});

test('reverse-geocode rejects invalid coordinates', async () => {
  const req = { method: 'GET', query: { lat: 'x', lon: '1' } };
  const res = createRes();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Invalid coordinates' });
});

test('reverse-geocode returns data on success', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.MAPBOX_ACCESS_TOKEN;
  const originalMapboxEnabled = process.env.MAPBOX_ENABLED;
  const originalPreference = process.env.PREFER_OPEN_MAPS;
  process.env.MAPBOX_ENABLED = 'true';
  process.env.MAPBOX_ACCESS_TOKEN = 'test-key';
  process.env.PREFER_OPEN_MAPS = 'false';
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      features: [{ properties: { full_address: 'Test' } }],
    }),
  });
  const req = { method: 'GET', query: { lat: '-34.9', lon: '-57.95' } };
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
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { display_name: 'Test' });
});

test('reverse-geocode uses OpenStreetMap fallback when Mapbox token is missing', async () => {
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
        display_name: 'Fallback Street 123',
      }),
    };
  };

  const req = { method: 'GET', query: { lat: '-34.9', lon: '-57.95' } };
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
  assert.match(requestedUrls[0], /nominatim\.openstreetmap\.org/);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { display_name: 'Fallback Street 123' });
});

test('reverse-geocode prefers OpenStreetMap by default even when Mapbox is configured', async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.MAPBOX_ACCESS_TOKEN;
  const originalPreference = process.env.PREFER_OPEN_MAPS;
  process.env.MAPBOX_ACCESS_TOKEN = 'test-key';
  delete process.env.PREFER_OPEN_MAPS;

  let fetchCount = 0;
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    fetchCount += 1;
    requestedUrls.push(String(url));
    return {
      ok: true,
      json: async () => ({
        display_name: 'Open Maps First',
      }),
    };
  };

  const req = { method: 'GET', query: { lat: '-34.9', lon: '-57.95' } };
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
  assert.match(requestedUrls[0], /nominatim\.openstreetmap\.org/);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { display_name: 'Open Maps First' });
});
