import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempDir = path.join(__dirname, '..', '.temp-test-db');
const tempDbPath = path.join(tempDir, 'fletes-test-debt.db');

fs.mkdirSync(tempDir, { recursive: true });
if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
process.env.DB_PATH = tempDbPath;

const db = await import('../fletes-backend/src/db.js');

const cleanup = () => {
  const drivers = db.listDrivers();
  for (const d of drivers) db.deleteDriver(d.id);
  const jobs = db.listJobs();
  for (const j of jobs) db.deleteJob(j.id);
  const vehicles = db.listVehicles();
  for (const v of vehicles) db.deleteVehicle(v.id);
};

process.on('exit', () => {
  try { if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath); } catch {}
});

describe('driver debt refresh', () => {
  beforeEach(cleanup);

  it('computes zero debt for owner account driver (code 6666)', () => {
    const driver = db.createDriver({
      id: 'driver-owner',
      name: 'Owner',
      code: '6666',
      phone: '111',
    });
    assert.equal(driver.ownerDebtAmount, 0);
    assert.equal(driver.ownerDebtGrossAmount, 0);
  });

  it('computes debt from chargedAmount for owner-vehicle external driver', () => {
    db.createVehicle({
      id: 'v1',
      name: 'Camion',
      size: 'small',
      ownershipType: 'owner',
      hourlyRate: 15000,
      costPerKm: 100,
      fixedMonthlyCost: 0,
    });

    db.createDriver({
      id: 'driver-ownerveh',
      name: 'Chofer',
      code: 'CH001',
      phone: '222',
      vehicleId: 'v1',
    });

    db.createJob({
      id: 'job-1',
      clientName: 'Cliente A',
      pickup: { address: 'A', lat: -34.92, lng: -57.95 },
      dropoff: { address: 'B', lat: -34.91, lng: -57.95 },
      status: 'DONE',
      driverId: 'driver-ownerveh',
      vehicleId: 'v1',
      chargedAmount: 30000,
      helpersCount: 2,
      estimatedDurationMinutes: 70,
      flags: {},
      timestamps: {},
    });

    const refreshed = db.getDriverById('driver-ownerveh');
    assert.ok(refreshed.ownerDebtGrossAmount > 0);
    assert.ok(refreshed.ownerDebtGrossAmount <= 30000);
  });

  it('computes debt using long-distance km pricing', () => {
    db.createVehicle({
      id: 'v-ld',
      name: 'Camion LD',
      size: 'large',
      ownershipType: 'owner',
      hourlyRate: 15000,
      costPerKm: 100,
      fixedMonthlyCost: 0,
      pricePerLongDistanceKm: 500,
    });

    db.createDriver({
      id: 'driver-ld',
      name: 'Chofer LD',
      code: 'LD001',
      phone: '333',
      vehicleId: 'v-ld',
    });

    db.createJob({
      id: 'job-ld-1',
      clientName: 'Cliente LD',
      pickup: { address: 'La Plata', lat: -34.92, lng: -57.95 },
      dropoff: { address: 'MDQ', lat: -38.00, lng: -57.55 },
      status: 'DONE',
      driverId: 'driver-ld',
      vehicleId: 'v-ld',
      chargedAmount: 170000,
      helpersCount: 0,
      estimatedDurationMinutes: 240,
      isLongDistance: true,
      distanceMeters: 383000,
      flags: {},
      timestamps: {},
    });

    const refreshed = db.getDriverById('driver-ld');
    assert.ok(refreshed.ownerDebtGrossAmount > 0);
    assert.ok(refreshed.ownerDebtGrossAmount <= 170000);
  });

  it('uses manualPrice as LD base for debt instead of auto per-km calculation', () => {
    db.createVehicle({
      id: 'v-ld-manual',
      name: 'Camion LD Manual',
      size: 'large',
      ownershipType: 'owner',
      hourlyRate: 15000,
      costPerKm: 100,
      fixedMonthlyCost: 0,
      pricePerLongDistanceKm: 500,
    });

    db.createDriver({
      id: 'driver-ld-manual',
      name: 'Chofer LD Manual',
      code: 'LDM01',
      phone: '444',
      vehicleId: 'v-ld-manual',
    });

    // distanceMeters 383000 → auto would be 383 * 500 = 191500
    // manualPrice 250000 → debt must use 250000, not 191500
    db.createJob({
      id: 'job-ld-manual-1',
      clientName: 'Cliente LD Manual',
      pickup: { address: 'La Plata', lat: -34.92, lng: -57.95 },
      dropoff: { address: 'MDQ', lat: -38.00, lng: -57.55 },
      status: 'DONE',
      driverId: 'driver-ld-manual',
      vehicleId: 'v-ld-manual',
      chargedAmount: 250000,
      helpersCount: 0,
      estimatedDurationMinutes: 240,
      isLongDistance: true,
      distanceMeters: 383000,
      manualPrice: 250000,
      flags: {},
      timestamps: {},
    });

    const refreshed = db.getDriverById('driver-ld-manual');
    // manualPrice=250000, owner-vehicle default ratio 1/3
    // ownerShare = roundMoney(250000 - (250000 * 1/3)) = roundMoney(166666.67)
    // driverKept = min(250000, 250000 - 166666.67) = 83333.33
    // grossOwnerDebt = 250000 - 83333.33 = 166666.67
    assert.strictEqual(refreshed.ownerDebtGrossAmount, 166666.67);
    assert.strictEqual(refreshed.ownerDebtAmount, 166666.67);
  });

  it('allows legacy LD unrelated edit and retains auto-km fallback', () => {
    db.createVehicle({
      id: 'v-legacy',
      name: 'Camion Legacy',
      size: 'large',
      ownershipType: 'owner',
      hourlyRate: 15000,
      costPerKm: 100,
      fixedMonthlyCost: 0,
      pricePerLongDistanceKm: 500,
    });
    db.createDriver({
      id: 'driver-legacy',
      name: 'Chofer Legacy',
      code: 'LEG01',
      phone: '555',
      vehicleId: 'v-legacy',
    });
    db.createJob({
      id: 'job-legacy',
      clientName: 'Cliente Legacy',
      pickup: { address: 'La Plata', lat: -34.92, lng: -57.95 },
      dropoff: { address: 'MDQ', lat: -38.00, lng: -57.55 },
      status: 'DONE',
      driverId: 'driver-legacy',
      vehicleId: 'v-legacy',
      chargedAmount: 200000,
      helpersCount: 0,
      estimatedDurationMinutes: 240,
      isLongDistance: true,
      distanceMeters: 383000,
      flags: {},
      timestamps: {},
    });

    const updated = db.updateJob('job-legacy', { description: 'updated desc' });
    assert.ok(updated);
    assert.strictEqual(updated.description, 'updated desc');
    assert.strictEqual(updated.manualPrice, undefined);

    const refreshed = db.getDriverById('driver-legacy');
    assert.ok(refreshed.ownerDebtGrossAmount > 0);
    assert.ok(refreshed.ownerDebtGrossAmount < 200000);
  });

  it('manual LD edit switches debt from fallback to manual base', () => {
    db.createVehicle({
      id: 'v-edit-ld',
      name: 'Camion Edit LD',
      size: 'large',
      ownershipType: 'owner',
      hourlyRate: 15000,
      costPerKm: 100,
      fixedMonthlyCost: 0,
      pricePerLongDistanceKm: 500,
    });
    db.createDriver({
      id: 'driver-edit-ld',
      name: 'Chofer Edit LD',
      code: 'EDT01',
      phone: '666',
      vehicleId: 'v-edit-ld',
    });
    db.createJob({
      id: 'job-edit-ld',
      clientName: 'Cliente Edit',
      pickup: { address: 'La Plata', lat: -34.92, lng: -57.95 },
      dropoff: { address: 'MDQ', lat: -38.00, lng: -57.55 },
      status: 'DONE',
      driverId: 'driver-edit-ld',
      vehicleId: 'v-edit-ld',
      chargedAmount: 300000,
      helpersCount: 0,
      estimatedDurationMinutes: 240,
      isLongDistance: true,
      distanceMeters: 383000,
      flags: {},
      timestamps: {},
    });

    const before = db.getDriverById('driver-edit-ld');
    assert.ok(before.ownerDebtGrossAmount > 0);

    db.updateJob('job-edit-ld', { manualPrice: 300000 });
    const after = db.getDriverById('driver-edit-ld');
    assert.strictEqual(after.ownerDebtGrossAmount, 200000);

    db.updateJob('job-edit-ld', { manualPrice: 350000 });
    const updated = db.getDriverById('driver-edit-ld');
    assert.strictEqual(updated.ownerDebtGrossAmount, 183333.33);
  });

  it('updates outstanding debt after settlement', () => {
    db.createVehicle({
      id: 'v-settle',
      name: 'Camion',
      size: 'small',
      ownershipType: 'owner',
      hourlyRate: 15000,
      costPerKm: 100,
      fixedMonthlyCost: 0,
    });

    db.createDriver({
      id: 'driver-settle',
      name: 'Chofer',
      code: 'SET01',
      phone: '444',
      vehicleId: 'v-settle',
    });

    db.createJob({
      id: 'job-settle-1',
      clientName: 'Cliente',
      pickup: { address: 'A', lat: -34.92, lng: -57.95 },
      dropoff: { address: 'B', lat: -34.91, lng: -57.95 },
      status: 'DONE',
      driverId: 'driver-settle',
      vehicleId: 'v-settle',
      chargedAmount: 30000,
      helpersCount: 0,
      estimatedDurationMinutes: 70,
      flags: {},
      timestamps: {},
    });

    const before = db.getDriverById('driver-settle');
    assert.ok(before.ownerDebtGrossAmount > 0);

    db.updateDriver('driver-settle', {
      ownerDebtSettledAmount: before.ownerDebtGrossAmount,
      ownerDebtSettledAt: new Date().toISOString(),
    });

    const after = db.getDriverById('driver-settle');
    assert.equal(after.ownerDebtAmount, 0);
    assert.ok(after.ownerDebtSettledAmount > 0);
  });
});
