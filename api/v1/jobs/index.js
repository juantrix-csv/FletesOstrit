import { createJob, listJobs } from '../../_db.js';

const ALLOWED_STATUSES = new Set([
  'PENDING',
  'TO_PICKUP',
  'LOADING',
  'TO_DROPOFF',
  'UNLOADING',
  'DONE',
]);

const parseBody = (req) => {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
};

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isLocation = (value) => (
  value &&
  typeof value.address === 'string' &&
  Number.isFinite(value.lat) &&
  Number.isFinite(value.lng)
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const jobs = await listJobs();
    res.status(200).json(jobs);
    return;
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
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
    const created = await createJob(body);
    res.status(201).json(created);
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
