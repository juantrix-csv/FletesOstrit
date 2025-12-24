import express from 'express';
import cors from 'cors';
import { createJob, deleteJob, getJob, listJobs, seedJobsIfEmpty, updateJob } from './db.js';

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
const isLocation = (value) => (
  value &&
  typeof value.address === 'string' &&
  Number.isFinite(value.lat) &&
  Number.isFinite(value.lng)
);

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/', (_req, res) => {
  res.json({
    name: 'Fletes API',
    ok: true,
    endpoints: {
      health: '/api/v1/health',
      jobs: '/api/v1/jobs',
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
  res.json(listJobs());
});

app.get(`${API_PREFIX}/jobs/:id`, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
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
  if (!ALLOWED_STATUSES.has(body.status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
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
