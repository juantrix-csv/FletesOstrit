import { deleteVehicle, updateVehicle } from '../../_db.js';

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
const VEHICLE_SIZES = new Set(['chico', 'mediano', 'grande']);
const isVehicleSize = (value) => typeof value === 'string' && VEHICLE_SIZES.has(value);

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'PATCH') {
    const body = parseBody(req);
    if (body.name && !isNonEmptyString(body.name)) {
      res.status(400).json({ error: 'Invalid name' });
      return;
    }
    if (body.size && !isVehicleSize(body.size)) {
      res.status(400).json({ error: 'Invalid size' });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'costPerKm') && !isNonNegativeNumber(body.costPerKm)) {
      res.status(400).json({ error: 'Invalid costPerKm' });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'fixedMonthlyCost') && !isNonNegativeNumber(body.fixedMonthlyCost)) {
      res.status(400).json({ error: 'Invalid fixedMonthlyCost' });
      return;
    }
    const updated = await updateVehicle(id, body);
    if (!updated) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json(updated);
    return;
  }

  if (req.method === 'DELETE') {
    const removed = await deleteVehicle(id);
    if (!removed) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).send();
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
