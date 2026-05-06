import test from 'node:test';
import assert from 'node:assert/strict';
import { getBilledHoursFromDurationMs, getBilledHoursFromMinutes } from '../lib/billing.js';

test('billing keeps the minimum charge at one hour through the first hour', () => {
  assert.equal(getBilledHoursFromMinutes(1), 1);
  assert.equal(getBilledHoursFromMinutes(60), 1);
});

test('billing rounds every started hour up to a full hour', () => {
  assert.equal(getBilledHoursFromMinutes(61), 2);
  assert.equal(getBilledHoursFromMinutes(85), 2);
  assert.equal(getBilledHoursFromMinutes(120), 2);
  assert.equal(getBilledHoursFromMinutes(121), 3);
  assert.equal(getBilledHoursFromMinutes(240), 4);
  assert.equal(getBilledHoursFromMinutes(241), 5);
});

test('billing supports millisecond inputs', () => {
  assert.equal(getBilledHoursFromDurationMs(60 * 60 * 1000), 1);
  assert.equal(getBilledHoursFromDurationMs(61 * 60 * 1000), 2);
});
