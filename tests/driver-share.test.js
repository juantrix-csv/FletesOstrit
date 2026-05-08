import test from 'node:test';
import assert from 'node:assert/strict';
import { getDriverOwnedVehicleShare } from '../lib/driverShare.js';

test('driver-owned vehicle keeps 10000 per billed hour for the company', () => {
  assert.deepEqual(getDriverOwnedVehicleShare({ hourlyBaseAmount: 35000, billedHours: 1 }), {
    driverShareAmount: 25000,
    companyShareAmount: 10000,
    driverShareRatio: 25000 / 35000,
  });

  assert.deepEqual(getDriverOwnedVehicleShare({ hourlyBaseAmount: 52500, billedHours: 1.5 }), {
    driverShareAmount: 37500,
    companyShareAmount: 15000,
    driverShareRatio: 37500 / 52500,
  });

  assert.deepEqual(getDriverOwnedVehicleShare({ hourlyBaseAmount: 70000, billedHours: 2 }), {
    driverShareAmount: 50000,
    companyShareAmount: 20000,
    driverShareRatio: 50000 / 70000,
  });
});
