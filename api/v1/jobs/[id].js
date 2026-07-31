import { isLocation, isLocationArray } from '../../_location.js';
import { deleteJob, getDriverByCode, getDriverById, getJobById, getVehicleById, updateJob } from '../../_db.js';

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

const isNonNegativeInteger = (value) => Number.isInteger(value) && value >= 0;
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0;
const isNonNegativeNumber = (value) => Number.isFinite(value) && value >= 0;
const isOptionalBoolean = (value) => value == null || typeof value === 'boolean';

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
    if (body.stopIndex != null && !isNonNegativeInteger(body.stopIndex)) {
      res.status(400).json({ error: 'Invalid stopIndex' });
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
    if (body.cashAmount != null && !isNonNegativeNumber(body.cashAmount)) {
      res.status(400).json({ error: 'Invalid cashAmount' });
      return;
    }
    if (body.transferAmount != null && !isNonNegativeNumber(body.transferAmount)) {
      res.status(400).json({ error: 'Invalid transferAmount' });
      return;
    }
    if (!isOptionalBoolean(body.isLongDistance)) {
      res.status(400).json({ error: 'Invalid isLongDistance' });
      return;
    }
    if (body.manualPrice != null && !isNonNegativeNumber(body.manualPrice)) {
      res.status(400).json({ error: 'Invalid manualPrice' });
      return;
    }
    if (body.driverId) {
      const driver = await getDriverById(body.driverId);
      if (!driver) {
        res.status(400).json({ error: 'Invalid driverId' });
        return;
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'vehicleId')) {
      if (body.vehicleId == null) {
        body.vehicleId = null;
      } else if (typeof body.vehicleId !== 'string' || !body.vehicleId.trim()) {
        res.status(400).json({ error: 'Invalid vehicleId' });
        return;
      } else {
        const vehicle = await getVehicleById(body.vehicleId);
        if (!vehicle) {
          res.status(400).json({ error: 'Invalid vehicleId' });
          return;
        }
        body.vehicleId = vehicle.id;
      }
    }

    const current = await getJobById(id);
    if (!current) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    const resultingIsLongDistance = Object.prototype.hasOwnProperty.call(body, 'isLongDistance')
      ? body.isLongDistance
      : (current.isLongDistance ?? false);

    if (resultingIsLongDistance === true) {
      const bodyHasManualPrice = Object.prototype.hasOwnProperty.call(body, 'manualPrice');
      const effectiveVal = bodyHasManualPrice ? body.manualPrice : undefined;
      const wasLongDistance = current.isLongDistance === true;
      const hasExistingManualPrice = Number.isFinite(current.manualPrice) && current.manualPrice > 0;

      if (!wasLongDistance) {
        if (effectiveVal == null || !Number.isFinite(effectiveVal) || effectiveVal <= 0) {
          res.status(400).json({ error: 'manualPrice is required and must be positive when switching to long-distance' });
          return;
        }
      } else if (bodyHasManualPrice) {
        if (effectiveVal == null) {
          if (hasExistingManualPrice) {
            res.status(400).json({ error: 'cannot clear manualPrice on a long-distance job that already has one' });
            return;
          }
        } else if (!Number.isFinite(effectiveVal) || effectiveVal <= 0) {
          res.status(400).json({ error: 'manualPrice must be positive for long-distance jobs' });
          return;
        }
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
