import { createJob, getDriverByCode, getDriverById, getVehicleById, listJobs } from '../../_db.js';

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

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const driverId = typeof req.query.driverId === 'string' ? req.query.driverId : null;
    const driverCode = typeof req.query.driverCode === 'string' ? req.query.driverCode : null;
    if (driverCode) {
      const driver = await getDriverByCode(driverCode.trim().toUpperCase());
      if (!driver) {
        res.status(200).json([]);
        return;
      }
      const jobs = await listJobs({ driverId: driver.id });
      res.status(200).json(jobs);
      return;
    }
    if (driverId) {
      const jobs = await listJobs({ driverId });
      res.status(200).json(jobs);
      return;
    }
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
    if (body.extraStops != null && !isLocationArray(body.extraStops)) {
      res.status(400).json({ error: 'Invalid extraStops' });
      return;
    }
    if (body.stopIndex != null && !isNonNegativeInteger(body.stopIndex)) {
      res.status(400).json({ error: 'Invalid stopIndex' });
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
    if (body.cashAmount != null && !isNonNegativeNumber(body.cashAmount)) {
      res.status(400).json({ error: 'Invalid cashAmount' });
      return;
    }
    if (body.transferAmount != null && !isNonNegativeNumber(body.transferAmount)) {
      res.status(400).json({ error: 'Invalid transferAmount' });
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
      if (body.vehicleId == null || body.vehicleId === '') {
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
    const created = await createJob(body);
    res.status(201).json(created);
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
