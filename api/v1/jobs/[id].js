import { deleteJob, getDriverByCode, getDriverById, getJobById, updateJob } from '../../_db.js';

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
const isLocationArray = (value) => Array.isArray(value) && value.every(isLocation);
const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
const isNonNegativeNumber = (value) => Number.isFinite(value) && value >= 0;

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'GET') {
    const job = await getJobById(id);
    if (!job) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const driverId = typeof req.query.driverId === 'string' ? req.query.driverId : null;
    const driverCode = typeof req.query.driverCode === 'string' ? req.query.driverCode : null;
    if (driverCode) {
      const driver = await getDriverByCode(driverCode.trim().toUpperCase());
      if (!driver || job.driverId !== driver.id) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
    }
    if (driverId && job.driverId !== driverId) {
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
      const driver = await getDriverById(body.driverId);
      if (!driver) {
        res.status(400).json({ error: 'Invalid driverId' });
        return;
      }
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
