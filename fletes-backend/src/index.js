import express from 'express';
import cors from 'cors';
import {
  createDriver,
  createJob,
  deleteDriver,
  deleteJob,
  getDriverByCode,
  getDriverById,
  getJob,
  getSetting,
  listCompletedJobs,
  listDrivers,
  listDriverLocations,
  listJobs,
  seedJobsIfEmpty,
  setSetting,
  upsertDriverLocation,
  updateDriver,
  updateJob,
} from './db.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const API_PREFIX = '/api/v1';

const ALLOWED_STATUSES = new Set([
  'PENDING',
  'TO_PICKUP',
  'LOADING',
  'TO_DROPOFF',
  'UNLOADING',
  'DONE',
]);

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isFiniteNumber = (value) => Number.isFinite(value);
const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
const isNonNegativeNumber = (value) => Number.isFinite(value) && value >= 0;
const isLocation = (value) => (
  value &&
  typeof value.address === 'string' &&
  Number.isFinite(value.lat) &&
  Number.isFinite(value.lng)
);
const isLocationArray = (value) => Array.isArray(value) && value.every(isLocation);

const parseTimestampMs = (value) => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

const parseSettingNumber = (value) => {
  if (value == null || value === '') return null;
  if (!isFiniteNumber(value) || value < 0) return NaN;
  return value;
};

const getJobStartMs = (job) =>
  parseTimestampMs(job.timestamps?.startJobAt)
  ?? parseTimestampMs(job.timestamps?.startLoadingAt)
  ?? parseTimestampMs(job.timestamps?.startTripAt)
  ?? parseTimestampMs(job.timestamps?.startUnloadingAt)
  ?? null;

const getJobEndMs = (job) =>
  parseTimestampMs(job.timestamps?.endUnloadingAt)
  ?? parseTimestampMs(job.timestamps?.endTripAt)
  ?? null;

const csvValue = (value) => {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const getBilledHours = (durationMs) => {
  if (durationMs == null) return null;
  if (durationMs <= 0) return 0;
  return Math.ceil(durationMs / 3600000);
};

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.json({
    name: 'Fletes API',
    ok: true,
    endpoints: {
      health: '/api/v1/health',
      jobs: '/api/v1/jobs',
      drivers: '/api/v1/drivers',
    },
  });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get(`${API_PREFIX}/health`, (_req, res) => {
  res.json({ ok: true });
});

app.get(`${API_PREFIX}/jobs`, (_req, res) => {
  const driverId = typeof _req.query.driverId === 'string' ? _req.query.driverId : null;
  const driverCode = typeof _req.query.driverCode === 'string' ? _req.query.driverCode : null;
  if (driverCode) {
    const driver = getDriverByCode(driverCode.trim().toUpperCase());
    if (!driver) {
      res.json([]);
      return;
    }
    res.json(listJobs({ driverId: driver.id }));
    return;
  }
  if (driverId) {
    res.json(listJobs({ driverId }));
    return;
  }
  res.json(listJobs());
});

app.get(`${API_PREFIX}/jobs/history/export`, (_req, res) => {
  const completed = listCompletedJobs();
  const drivers = listDrivers();
  const driversById = new Map(drivers.map((driver) => [driver.id, driver]));
  const storedRate = getSetting('hourlyRate');
  const hourlyRate = typeof storedRate === 'number' && Number.isFinite(storedRate) ? storedRate : null;
  const storedHelperRate = getSetting('helperHourlyRate');
  const helperHourlyRate = typeof storedHelperRate === 'number' && Number.isFinite(storedHelperRate) ? storedHelperRate : null;
  const header = [
    'job_id',
    'client_name',
    'driver_name',
    'description',
    'helpers_count',
    'pickup_address',
    'dropoff_address',
    'scheduled_date',
    'scheduled_time',
    'start_time',
    'end_time',
    'duration_minutes',
    'duration_hours',
    'hourly_rate',
    'total_value',
    'helper_hourly_rate',
    'helpers_total_value',
    'total_with_helpers',
    'charged_amount',
    'total_billed',
    'created_at',
    'updated_at',
  ];
  const rows = [header];
  completed.forEach((job) => {
    const startMs = getJobStartMs(job);
    const endMs = getJobEndMs(job);
    const durationMs = startMs != null && endMs != null ? Math.max(0, endMs - startMs) : null;
    const durationMinutes = durationMs != null ? Math.round(durationMs / 60000) : null;
    const durationHours = durationMs != null ? Number((durationMs / 3600000).toFixed(2)) : null;
    const billedHours = getBilledHours(durationMs);
    const totalValue = hourlyRate != null && billedHours != null ? Number((billedHours * hourlyRate).toFixed(2)) : null;
    const helpersCount = Number.isFinite(job.helpersCount) ? job.helpersCount : 0;
    const helpersTotalValue = helperHourlyRate != null && billedHours != null && helpersCount > 0
      ? Number((billedHours * helperHourlyRate * helpersCount).toFixed(2))
      : null;
    const totalWithHelpers = totalValue != null && helpersTotalValue != null
      ? Number((totalValue + helpersTotalValue).toFixed(2))
      : totalValue ?? helpersTotalValue;
    const chargedAmount = Number.isFinite(job.chargedAmount) ? job.chargedAmount : null;
    const totalBilled = chargedAmount != null ? Number(chargedAmount.toFixed(2)) : totalWithHelpers;
    const driverName = job.driverId ? driversById.get(job.driverId)?.name ?? '' : '';
    rows.push([
      job.id,
      job.clientName,
      driverName,
      job.description ?? '',
      helpersCount,
      job.pickup?.address ?? '',
      job.dropoff?.address ?? '',
      job.scheduledDate ?? '',
      job.scheduledTime ?? '',
      startMs != null ? new Date(startMs).toISOString() : '',
      endMs != null ? new Date(endMs).toISOString() : '',
      durationMinutes,
      durationHours,
      hourlyRate,
      totalValue,
      helperHourlyRate,
      helpersTotalValue,
      totalWithHelpers,
      chargedAmount,
      totalBilled,
      job.createdAt,
      job.updatedAt,
    ]);
  });
  const csv = rows.map((row) => row.map(csvValue).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="historial-fletes.csv"');
  res.send(csv);
});

app.get(`${API_PREFIX}/jobs/:id`, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const driverId = typeof req.query.driverId === 'string' ? req.query.driverId : null;
  const driverCode = typeof req.query.driverCode === 'string' ? req.query.driverCode : null;
  if (driverCode) {
    const driver = getDriverByCode(driverCode.trim().toUpperCase());
    if (!driver || job.driverId !== driver.id) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
  }
  if (driverId && job.driverId !== driverId) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(job);
});

app.get(`${API_PREFIX}/settings/hourly-rate`, (_req, res) => {
  const stored = getSetting('hourlyRate');
  const hourlyRate = typeof stored === 'number' && Number.isFinite(stored) ? stored : null;
  res.json({ hourlyRate });
});

app.put(`${API_PREFIX}/settings/hourly-rate`, (req, res) => {
  const body = req.body ?? {};
  if (body.hourlyRate == null || body.hourlyRate === '') {
    setSetting('hourlyRate', null);
    res.json({ hourlyRate: null });
    return;
  }
  if (!isFiniteNumber(body.hourlyRate) || body.hourlyRate < 0) {
    res.status(400).json({ error: 'Invalid hourlyRate' });
    return;
  }
  const saved = setSetting('hourlyRate', body.hourlyRate);
  const hourlyRate = typeof saved === 'number' && Number.isFinite(saved) ? saved : null;
  res.json({ hourlyRate });
});

app.get(`${API_PREFIX}/settings/helper-hourly-rate`, (_req, res) => {
  const stored = getSetting('helperHourlyRate');
  const hourlyRate = typeof stored === 'number' && Number.isFinite(stored) ? stored : null;
  res.json({ hourlyRate });
});

app.put(`${API_PREFIX}/settings/helper-hourly-rate`, (req, res) => {
  const body = req.body ?? {};
  if (body.hourlyRate == null || body.hourlyRate === '') {
    setSetting('helperHourlyRate', null);
    res.json({ hourlyRate: null });
    return;
  }
  if (!isFiniteNumber(body.hourlyRate) || body.hourlyRate < 0) {
    res.status(400).json({ error: 'Invalid hourlyRate' });
    return;
  }
  const saved = setSetting('helperHourlyRate', body.hourlyRate);
  const hourlyRate = typeof saved === 'number' && Number.isFinite(saved) ? saved : null;
  res.json({ hourlyRate });
});

const sendSettingValue = (res, stored) => {
  const value = typeof stored === 'number' && Number.isFinite(stored) ? stored : null;
  res.json({ value });
};

app.get(`${API_PREFIX}/settings/fixed-monthly-cost`, (_req, res) => {
  sendSettingValue(res, getSetting('fixedMonthlyCost'));
});

app.put(`${API_PREFIX}/settings/fixed-monthly-cost`, (req, res) => {
  const body = req.body ?? {};
  const parsed = parseSettingNumber(body.value);
  if (Number.isNaN(parsed)) {
    res.status(400).json({ error: 'Invalid value' });
    return;
  }
  const saved = setSetting('fixedMonthlyCost', parsed);
  sendSettingValue(res, saved);
});

app.get(`${API_PREFIX}/settings/trip-cost-per-hour`, (_req, res) => {
  sendSettingValue(res, getSetting('tripCostPerHour'));
});

app.put(`${API_PREFIX}/settings/trip-cost-per-hour`, (req, res) => {
  const body = req.body ?? {};
  const parsed = parseSettingNumber(body.value);
  if (Number.isNaN(parsed)) {
    res.status(400).json({ error: 'Invalid value' });
    return;
  }
  const saved = setSetting('tripCostPerHour', parsed);
  sendSettingValue(res, saved);
});

app.get(`${API_PREFIX}/settings/trip-cost-per-km`, (_req, res) => {
  sendSettingValue(res, getSetting('tripCostPerKm'));
});

app.put(`${API_PREFIX}/settings/trip-cost-per-km`, (req, res) => {
  const body = req.body ?? {};
  const parsed = parseSettingNumber(body.value);
  if (Number.isNaN(parsed)) {
    res.status(400).json({ error: 'Invalid value' });
    return;
  }
  const saved = setSetting('tripCostPerKm', parsed);
  sendSettingValue(res, saved);
});

app.post(`${API_PREFIX}/jobs`, (req, res) => {
  const body = req.body ?? {};
  if (!isNonEmptyString(body.id)) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }
  if (!isNonEmptyString(body.clientName)) {
    res.status(400).json({ error: 'Missing clientName' });
    return;
  }
  if (!isLocation(body.pickup) || !isLocation(body.dropoff)) {
    res.status(400).json({ error: 'Invalid pickup/dropoff' });
    return;
  }
  if (body.extraStops != null && !isLocationArray(body.extraStops)) {
    res.status(400).json({ error: 'Invalid extraStops' });
    return;
  }
  if (!ALLOWED_STATUSES.has(body.status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }
  if (body.description != null && typeof body.description !== 'string') {
    res.status(400).json({ error: 'Invalid description' });
    return;
  }
  if (body.helpersCount != null && !isNonNegativeInteger(body.helpersCount)) {
    res.status(400).json({ error: 'Invalid helpersCount' });
    return;
  }
  if (body.estimatedDurationMinutes != null && !isPositiveInteger(body.estimatedDurationMinutes)) {
    res.status(400).json({ error: 'Invalid estimatedDurationMinutes' });
    return;
  }
  if (body.chargedAmount != null && !isNonNegativeNumber(body.chargedAmount)) {
    res.status(400).json({ error: 'Invalid chargedAmount' });
    return;
  }
  if (body.driverId) {
    const driver = getDriverById(body.driverId);
    if (!driver) {
      res.status(400).json({ error: 'Invalid driverId' });
      return;
    }
  }
  const created = createJob(body);
  res.status(201).json(created);
});

app.patch(`${API_PREFIX}/jobs/:id`, (req, res) => {
  const body = req.body ?? {};
  if (body.status && !ALLOWED_STATUSES.has(body.status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }
  if (body.pickup && !isLocation(body.pickup)) {
    res.status(400).json({ error: 'Invalid pickup' });
    return;
  }
  if (body.dropoff && !isLocation(body.dropoff)) {
    res.status(400).json({ error: 'Invalid dropoff' });
    return;
  }
  if (body.extraStops != null && !isLocationArray(body.extraStops)) {
    res.status(400).json({ error: 'Invalid extraStops' });
    return;
  }
  if (body.description != null && typeof body.description !== 'string') {
    res.status(400).json({ error: 'Invalid description' });
    return;
  }
  if (body.helpersCount != null && !isNonNegativeInteger(body.helpersCount)) {
    res.status(400).json({ error: 'Invalid helpersCount' });
    return;
  }
  if (body.estimatedDurationMinutes != null && !isPositiveInteger(body.estimatedDurationMinutes)) {
    res.status(400).json({ error: 'Invalid estimatedDurationMinutes' });
    return;
  }
  if (body.chargedAmount != null && !isNonNegativeNumber(body.chargedAmount)) {
    res.status(400).json({ error: 'Invalid chargedAmount' });
    return;
  }
  if (body.driverId) {
    const driver = getDriverById(body.driverId);
    if (!driver) {
      res.status(400).json({ error: 'Invalid driverId' });
      return;
    }
  }
  const updated = updateJob(req.params.id, body);
  if (!updated) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(updated);
});

app.delete(`${API_PREFIX}/jobs/:id`, (req, res) => {
  const removed = deleteJob(req.params.id);
  if (!removed) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.status(204).send();
});

app.get(`${API_PREFIX}/drivers`, (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code.trim() : null;
  if (code) {
    const driver = getDriverByCode(code.toUpperCase());
    if (!driver) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(driver);
    return;
  }
  res.json(listDrivers());
});

app.post(`${API_PREFIX}/drivers`, (req, res) => {
  const body = req.body ?? {};
  if (!isNonEmptyString(body.id)) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }
  if (!isNonEmptyString(body.name)) {
    res.status(400).json({ error: 'Missing name' });
    return;
  }
  if (!isNonEmptyString(body.code)) {
    res.status(400).json({ error: 'Missing code' });
    return;
  }
  const normalizedCode = body.code.trim().toUpperCase();
  const exists = getDriverByCode(normalizedCode);
  if (exists) {
    res.status(409).json({ error: 'Code already in use' });
    return;
  }
  const created = createDriver({
    id: body.id,
    name: body.name,
    code: normalizedCode,
    phone: body.phone,
    active: body.active ?? true,
    createdAt: body.createdAt,
    updatedAt: body.updatedAt,
  });
  res.status(201).json(created);
});

app.patch(`${API_PREFIX}/drivers/:id`, (req, res) => {
  const body = req.body ?? {};
  if (body.name && !isNonEmptyString(body.name)) {
    res.status(400).json({ error: 'Invalid name' });
    return;
  }
  if (body.code && !isNonEmptyString(body.code)) {
    res.status(400).json({ error: 'Invalid code' });
    return;
  }
  if (body.code) {
    const normalizedCode = body.code.trim().toUpperCase();
    const existing = getDriverByCode(normalizedCode);
    if (existing && existing.id !== req.params.id) {
      res.status(409).json({ error: 'Code already in use' });
      return;
    }
    body.code = normalizedCode;
  }
  const updated = updateDriver(req.params.id, body);
  if (!updated) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(updated);
});

app.delete(`${API_PREFIX}/drivers/:id`, (req, res) => {
  const removed = deleteDriver(req.params.id);
  if (!removed) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.status(204).send();
});

app.get(`${API_PREFIX}/driver-locations`, (_req, res) => {
  res.json(listDriverLocations());
});

app.post(`${API_PREFIX}/driver-locations`, (req, res) => {
  const body = req.body ?? {};
  const driverId = typeof body.driverId === 'string' ? body.driverId.trim() : '';
  const driverCode = typeof body.driverCode === 'string' ? body.driverCode.trim().toUpperCase() : '';
  const lat = body.lat;
  const lng = body.lng;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
    res.status(400).json({ error: 'Invalid coordinates' });
    return;
  }
  let driver = null;
  if (driverId) {
    driver = getDriverById(driverId);
  }
  if (!driver && driverCode) {
    driver = getDriverByCode(driverCode);
  }
  if (!driver) {
    res.status(400).json({ error: 'Invalid driver' });
    return;
  }
  const updated = upsertDriverLocation({
    driverId: driver.id,
    lat,
    lng,
    accuracy: body.accuracy,
    heading: body.heading,
    speed: body.speed,
    jobId: body.jobId ?? null,
  });
  res.json(updated);
});

app.use((err, _req, res, _next) => {
  res.status(500).json({ error: 'Server error', detail: err?.message });
});

app.listen(PORT, () => {
  if (process.env.SEED_DEMO === '1') {
    const result = seedJobsIfEmpty();
    if (result.seeded) {
      console.log(`Seeded demo jobs: ${result.count}`);
    }
  }
  console.log(`Fletes API listening on port ${PORT}`);
});
