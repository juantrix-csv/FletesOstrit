import { deleteJob, getJobById, updateJob } from '../../_db.js';

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

const isLocation = (value) => (
  value &&
  typeof value.address === 'string' &&
  Number.isFinite(value.lat) &&
  Number.isFinite(value.lng)
);

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'GET') {
    const job = await getJobById(id);
    if (!job) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json(job);
    return;
  }

  if (req.method === 'PATCH') {
    const body = parseBody(req);
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
    const updated = await updateJob(id, body);
    if (!updated) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json(updated);
    return;
  }

  if (req.method === 'DELETE') {
    const removed = await deleteJob(id);
    if (!removed) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).send();
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
