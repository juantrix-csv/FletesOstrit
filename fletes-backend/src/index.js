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
  listDrivers,
  listDriverLocations,
  listJobs,
  seedJobsIfEmpty,
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
const isLocation = (value) => (
  value &&
  typeof value.address === 'string' &&
  Number.isFinite(value.lat) &&
  Number.isFinite(value.lng)
);
const isLocationArray = (value) => Array.isArray(value) && value.every(isLocation);

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
