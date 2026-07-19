import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocation, normalizeLocation, normalizeLocations } from '../api/_location.js';

test('normalizes legacy location access metadata', () => {
  assert.deepEqual(normalizeLocation({ address: 'A', lat: 1, lng: 2 }), {
    address: 'A', lat: 1, lng: 2, floor: null, hasElevator: false, hasItemsThatDoNotFitElevator: false,
  });
});

test('preserves valid elevator metadata and normalizes arrays', () => {
  const location = { address: 'A', lat: 1, lng: 2, floor: 8, hasElevator: true, hasItemsThatDoNotFitElevator: true };
  assert.equal(isLocation(location), true);
  assert.deepEqual(normalizeLocations([location]), [location]);
});

test('rejects invalid floors and inconsistent elevator metadata', () => {
  assert.equal(isLocation({ address: 'A', lat: 1, lng: 2, floor: 100 }), false);
  assert.equal(isLocation({ address: 'A', lat: 1, lng: 2, floor: 2, hasElevator: false, hasItemsThatDoNotFitElevator: true }), false);
});
