import { deleteDriver, getDriverByCode, getVehicleById, updateDriver } from '../../_db.js';

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
const isNonNegativeNumber = (value) => Number.isFinite(value) && value >= 0;

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'PATCH') {
    const body = parseBody(req);
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
      const existing = await getDriverByCode(normalizedCode);
      if (existing && existing.id !== id) {
        res.status(409).json({ error: 'Code already in use' });
        return;
      }
      body.code = normalizedCode;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'vehicleId')) {
      if (body.vehicleId == null) {
        body.vehicleId = null;
      } else if (!isNonEmptyString(body.vehicleId)) {
        res.status(400).json({ error: 'Invalid vehicle' });
        return;
      } else {
        const vehicle = await getVehicleById(body.vehicleId);
        if (!vehicle) {
          res.status(400).json({ error: 'Invalid vehicle' });
          return;
        }
        body.vehicleId = vehicle.id;
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'ownerDebtSettledAmount')) {
      if (body.ownerDebtSettledAmount == null) {
        body.ownerDebtSettledAmount = null;
      } else if (!isNonNegativeNumber(body.ownerDebtSettledAmount)) {
        res.status(400).json({ error: 'Invalid ownerDebtSettledAmount' });
        return;
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, 'ownerDebtSettledAt')) {
      if (body.ownerDebtSettledAt == null) {
        body.ownerDebtSettledAt = null;
      } else if (!isNonEmptyString(body.ownerDebtSettledAt)) {
        res.status(400).json({ error: 'Invalid ownerDebtSettledAt' });
        return;
      }
    }
    const updated = await updateDriver(id, body);
    if (!updated) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json(updated);
    return;
  }

  if (req.method === 'DELETE') {
    const removed = await deleteDriver(id);
    if (!removed) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).send();
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
