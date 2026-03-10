import { createVehicle, deleteVehicle, getVehicleById, listVehicles, updateVehicle } from '../../_db.js';

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
  const pathParam = req.query.path;
  const id = Array.isArray(pathParam) ? pathParam[0] : (typeof pathParam === 'string' ? pathParam : null);
  const hasId = Boolean(id);

  if (!hasId && req.method === 'GET') {
    const vehicles = await listVehicles();
    res.status(200).json(vehicles);
    return;
  }

  if (!hasId && req.method === 'POST') {
    const body = parseBody(req);
    if (!isNonEmptyString(body.id)) {
      res.status(400).json({ error: 'Missing id' });
      return;
    }
    if (!isNonEmptyString(body.name)) {
      res.status(400).json({ error: 'Missing name' });
      return;
    }
    if (!isVehicleSize(body.size)) {
      res.status(400).json({ error: 'Invalid size' });
      return;
    }
    if (!isNonNegativeNumber(body.costPerKm)) {
      res.status(400).json({ error: 'Invalid costPerKm' });
      return;
    }
    if (!isNonNegativeNumber(body.fixedMonthlyCost)) {
      res.status(400).json({ error: 'Invalid fixedMonthlyCost' });
      return;
    }
    const exists = await getVehicleById(body.id);
    if (exists) {
      res.status(409).json({ error: 'Vehicle already exists' });
      return;
    }
    const created = await createVehicle({
      id: body.id,
      name: body.name,
      size: body.size,
      costPerKm: body.costPerKm,
      fixedMonthlyCost: body.fixedMonthlyCost,
      createdAt: body.createdAt,
      updatedAt: body.updatedAt,
    });
    res.status(201).json(created);
    return;
  }

  if (hasId && req.method === 'PATCH') {
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

  if (hasId && req.method === 'DELETE') {
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
