import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authorizeFinanceRead,
  buildFinanceResponse,
  resolveFinanceFilters,
} from '../lib/financeAccess.js';

const doneJob = {
  id: 'job-1',
  clientName: 'Cliente Uno',
  clientPhone: '2210000000',
  description: 'Mudanza',
  pickup: { address: 'Origen', lat: -34.9, lng: -57.9 },
  dropoff: { address: 'Destino', lat: -34.8, lng: -57.8 },
  extraStops: [],
  driverId: 'driver-1',
  helpersCount: 1,
  distanceMeters: 12500,
  status: 'DONE',
  cashAmount: 12000,
  transferAmount: 5000,
  driverShareAmount: 4000,
  companyShareAmount: 11000,
  driverShareRatio: 4000 / 15000,
  shareSource: 'owner_vehicle',
  timestamps: {
    startJobAt: '2026-04-10T11:00:00.000Z',
    endUnloadingAt: '2026-04-10T12:30:00.000Z',
  },
  createdAt: '2026-04-10T10:30:00.000Z',
  updatedAt: '2026-04-10T12:30:00.000Z',
};

const pendingJob = {
  id: 'job-2',
  clientName: 'Cliente Dos',
  pickup: { address: 'Origen 2', lat: -34.9, lng: -57.9 },
  dropoff: { address: 'Destino 2', lat: -34.8, lng: -57.8 },
  status: 'PENDING',
  timestamps: {},
  scheduledAt: Date.parse('2026-04-15T13:00:00.000Z'),
  createdAt: '2026-04-14T10:00:00.000Z',
  updatedAt: '2026-04-14T10:00:00.000Z',
};

const drivers = [{
  id: 'driver-1',
  name: 'Chofer Uno',
  code: '1234',
  phone: '2211111111',
  vehicleId: 'vehicle-1',
  ownerDebtSettledAmount: 2000,
  ownerDebtSettledAt: '2026-04-12T00:00:00.000Z',
  active: true,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-12T00:00:00.000Z',
}];

const vehicles = [{
  id: 'vehicle-1',
  name: 'Camioneta',
  size: 'mediano',
  ownershipType: 'owner',
  costPerKm: 250,
  fixedMonthlyCost: 100000,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
}];

const settings = {
  hourlyRate: 10000,
  helperHourlyRate: 2000,
  tripCostPerHour: 1000,
  tripCostPerKm: 100,
  fixedMonthlyCost: 50000,
  advertisingMonthlyCost: 20000,
  advertisingMonthlyCosts: { '2026-04': 25000 },
};

test('finance read auth requires a configured key and accepts x-api-key or bearer', () => {
  assert.deepEqual(authorizeFinanceRead({ headers: {} }, ''), {
    ok: false,
    status: 503,
    error: 'Finance read API key is not configured',
  });
  assert.deepEqual(authorizeFinanceRead({ headers: { 'x-api-key': 'bad' } }, 'secret'), {
    ok: false,
    status: 401,
    error: 'Unauthorized',
  });
  assert.deepEqual(authorizeFinanceRead({ headers: { 'x-api-key': 'secret' } }, 'secret'), { ok: true });
  assert.deepEqual(authorizeFinanceRead({ headers: { authorization: 'Bearer secret' } }, 'secret'), { ok: true });
});

test('finance snapshot includes accounting totals, filters, and driver debt', () => {
  const payload = buildFinanceResponse('snapshot', {
    generatedAt: '2026-04-14T00:00:00.000Z',
    jobs: [doneJob, pendingJob],
    drivers,
    vehicles,
    leads: [{ id: 'lead-1', clientName: 'Perdido', status: 'LOST', lossReason: 'PRICE' }],
    settings,
    filters: resolveFinanceFilters({ from: '2026-04-01', to: '2026-04-30', status: 'DONE' }),
  });

  assert.equal(payload.generatedAt, '2026-04-14T00:00:00.000Z');
  assert.equal(payload.jobs.length, 1);
  assert.equal(payload.jobs[0].billedHours, 1.5);
  assert.equal(payload.jobs[0].hourlyBaseAmount, 15000);
  assert.equal(payload.jobs[0].helpersAmount, 3000);
  assert.equal(payload.jobs[0].expectedTotal, 18000);
  assert.equal(payload.jobs[0].totalBilled, 17000);
  assert.equal(payload.jobs[0].costs.tripCostByHour, 1500);
  assert.equal(payload.jobs[0].costs.tripCostByKm, 1250);

  assert.equal(payload.summary.totals.jobs, 1);
  assert.equal(payload.summary.totals.completedJobs, 1);
  assert.equal(payload.summary.totals.totalBilled, 17000);
  assert.equal(payload.summary.totals.cashAmount, 12000);
  assert.equal(payload.summary.totals.transferAmount, 5000);
  assert.equal(payload.summary.totals.driverShareAmount, 4000);
  assert.equal(payload.summary.totals.companyShareAmount, 11000);
  assert.equal(payload.summary.paymentMethods.mixed, 1);
  assert.equal(payload.summary.leads.lostCount, 1);
  assert.equal(payload.summary.leads.lossReasons.PRICE, 1);

  const driverSummary = payload.summary.byDriver.find((driver) => driver.id === 'driver-1');
  assert.equal(driverSummary.grossOwnerDebt, 11000);
  assert.equal(driverSummary.outstandingOwnerDebt, 9000);
  assert.equal(driverSummary.driverKeptAmount, 6000);
});

test('finance response rejects unknown resources', () => {
  assert.equal(buildFinanceResponse('unknown', { jobs: [], drivers: [], vehicles: [] }), null);
});
