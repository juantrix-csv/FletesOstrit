import test from 'node:test';
import assert from 'node:assert/strict';
import { getBilledHoursFromDurationMs, getBilledHoursFromMinutes } from '../lib/billing.js';

test('billing keeps one hour until 70 minutes', () => {
  assert.equal(getBilledHoursFromMinutes(1), 1);
  assert.equal(getBilledHoursFromMinutes(60), 1);
  assert.equal(getBilledHoursFromMinutes(70), 1);
});

test('billing advances in half-hour steps after each 30 minute block plus 10 minute grace', () => {
  assert.equal(getBilledHoursFromMinutes(71), 1.5);
  assert.equal(getBilledHoursFromMinutes(100), 1.5);
  assert.equal(getBilledHoursFromMinutes(101), 2);
  assert.equal(getBilledHoursFromMinutes(130), 2);
  assert.equal(getBilledHoursFromMinutes(131), 2.5);
  assert.equal(getBilledHoursFromMinutes(160), 2.5);
  assert.equal(getBilledHoursFromMinutes(161), 3);
});

test('billing supports millisecond inputs', () => {
  assert.equal(getBilledHoursFromDurationMs(70 * 60 * 1000), 1);
  assert.equal(getBilledHoursFromDurationMs(71 * 60 * 1000), 1.5);
});

test('billing handles null, invalid, and non-positive durations', () => {
  assert.equal(getBilledHoursFromMinutes(null), null);
  assert.equal(getBilledHoursFromMinutes(Number.NaN), null);
  assert.equal(getBilledHoursFromDurationMs(undefined), null);
  assert.equal(getBilledHoursFromMinutes(-5), 0);
  assert.equal(getBilledHoursFromDurationMs(0), 0);
});
