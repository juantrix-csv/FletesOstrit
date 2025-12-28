import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../reverse-geocode.js';

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
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ display_name: 'Test' }),
  });
  const req = { method: 'GET', query: { lat: '-34.9', lon: '-57.95' } };
  const res = createRes();
  await handler(req, res);
  globalThis.fetch = originalFetch;
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { display_name: 'Test' });
});
