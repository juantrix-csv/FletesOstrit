import test from 'node:test';
import assert from 'node:assert/strict';
import { singleFlight } from '../lib/singleFlight.js';

/**
 * api/_db.js wraps runSchemaMigrations with singleFlight() so concurrent
 * ensureSchema() calls share one migration promise (single-flight) and reset
 * the cached promise on failure so a later request can retry.
 *
 * Test limitation: api/_db.js eagerly requires POSTGRES_URL and constructs a
 * pg.Pool, so it cannot be imported without a live PostgreSQL instance. These
 * tests exercise the exact single-flight wrapper used by ensureSchema against
 * an injected fake runner, covering the concurrency and failure-reset behavior
 * without requiring a database.
 */

test('singleFlight shares one in-flight promise across concurrent callers', async () => {
  let runs = 0;
  const run = () => new Promise((resolve) => {
    runs += 1;
    setTimeout(() => resolve('done'), 20);
  });
  const once = singleFlight(run);

  const results = await Promise.all([once(), once(), once()]);

  assert.deepEqual(results, ['done', 'done', 'done']);
  assert.equal(runs, 1);
});

test('singleFlight runs once for the process lifetime after success', async () => {
  let runs = 0;
  const run = async () => {
    runs += 1;
    return 'ok';
  };
  const once = singleFlight(run);

  await once();
  await once();
  await once();

  assert.equal(runs, 1);
});

test('singleFlight resets after failure so a later call retries', async () => {
  let runs = 0;
  const run = async () => {
    runs += 1;
    if (runs === 1) throw new Error('boom');
    return 'recovered';
  };
  const once = singleFlight(run);

  await assert.rejects(() => once(), /boom/);
  assert.equal(runs, 1);

  assert.equal(await once(), 'recovered');
  assert.equal(runs, 2);
});

test('singleFlight propagates one rejection to all concurrent callers and resets for retry', async () => {
  let runs = 0;
  const run = () => new Promise((resolve, reject) => {
    runs += 1;
    setTimeout(() => (runs === 1 ? reject(new Error('boom')) : resolve('recovered')), 10);
  });
  const once = singleFlight(run);

  const results = await Promise.allSettled([once(), once(), once()]);
  assert.equal(runs, 1);
  for (const result of results) {
    assert.equal(result.status, 'rejected');
    assert.match(result.reason.message, /boom/);
  }

  // The SAME wrapper, after the shared rejection, re-runs — proving the
  // cached promise reset on failure.
  assert.equal(await once(), 'recovered');
  assert.equal(runs, 2);
});

test('singleFlight turns a synchronous throw into a rejection and resets', async () => {
  let runs = 0;
  const run = () => {
    runs += 1;
    if (runs === 1) throw new Error('sync boom');
    return 'ok';
  };
  const once = singleFlight(run);

  await assert.rejects(() => once(), /sync boom/);
  assert.equal(await once(), 'ok');
  assert.equal(runs, 2);
});
