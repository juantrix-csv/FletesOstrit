import test from 'node:test';
import assert from 'node:assert/strict';
import { buildJobsHistoryCsv, JOB_HISTORY_CSV_HEADER } from '../lib/jobHistoryExport.js';

const completedJob = {
  id: 'job-1',
  clientName: 'Cliente, con coma',
  description: 'Flete "especial"',
  pickup: { address: 'Origen', lat: -34.9, lng: -57.9 },
  dropoff: { address: 'Destino', lat: -34.8, lng: -57.8 },
  driverId: 'driver-1',
  helpersCount: 2,
  cashAmount: 12000,
  transferAmount: 3000,
  driverShareRatio: 0.3,
  driverShareAmount: 4500,
  companyShareAmount: 10500,
  shareSource: 'owner_vehicle',
  status: 'DONE',
  timestamps: {
    startJobAt: '2026-04-10T10:00:00.000Z',
    endUnloadingAt: '2026-04-10T11:11:00.000Z',
  },
  scheduledDate: '2026-04-10',
  scheduledTime: '07:00',
  createdAt: '2026-04-10T09:00:00.000Z',
  updatedAt: '2026-04-10T11:11:00.000Z',
};

const drivers = [{
  id: 'driver-1',
  name: 'Chofer Uno',
  code: '1234',
  vehicleId: 'vehicle-1',
}];

const vehicles = [{
  id: 'vehicle-1',
  name: 'Camioneta',
  hourlyRate: 10000,
}];

const parseCsvLine = (line) => {
  const values = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted && char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
};

test('job history export computes billing, helpers, payment totals, and escapes CSV values', () => {
  const csv = buildJobsHistoryCsv({
    jobs: [completedJob],
    drivers,
    vehicles,
    hourlyRate: 9000,
    helperHourlyRate: 2500,
  });
  const [headerLine, rowLine] = csv.split('\n');
  const values = parseCsvLine(rowLine);
  const row = Object.fromEntries(JOB_HISTORY_CSV_HEADER.map((key, index) => [key, values[index]]));

  assert.equal(headerLine, JOB_HISTORY_CSV_HEADER.join(','));
  assert.equal(row.client_name, 'Cliente, con coma');
  assert.equal(row.description, 'Flete "especial"');
  assert.equal(row.driver_name, 'Chofer Uno');
  assert.equal(row.vehicle_name, 'Camioneta');
  assert.equal(row.duration_minutes, '71');
  assert.equal(row.duration_hours, '1.18');
  assert.equal(row.hourly_rate, '10000');
  assert.equal(row.total_value, '15000');
  assert.equal(row.helper_hourly_rate, '2500');
  assert.equal(row.helpers_total_value, '7500');
  assert.equal(row.total_with_helpers, '22500');
  assert.equal(row.payment_method, 'mixed');
  assert.equal(row.total_billed, '15000');
});

test('job history export falls back to charged amount when payment is unassigned', () => {
  const csv = buildJobsHistoryCsv({
    jobs: [{
      ...completedJob,
      cashAmount: null,
      transferAmount: null,
      chargedAmount: 18000,
      helpersCount: 0,
    }],
    drivers,
    vehicles: [{ id: 'vehicle-1', name: 'Camioneta' }],
    hourlyRate: 9000,
    helperHourlyRate: 2500,
  });
  const [, rowLine] = csv.split('\n');
  const values = parseCsvLine(rowLine);
  const row = Object.fromEntries(JOB_HISTORY_CSV_HEADER.map((key, index) => [key, values[index]]));

  assert.equal(row.vehicle_name, 'Camioneta');
  assert.equal(row.hourly_rate, '9000');
  assert.equal(row.charged_amount, '18000');
  assert.equal(row.payment_method, 'unassigned');
  assert.equal(row.unassigned_amount, '18000');
  assert.equal(row.total_billed, '18000');
});
