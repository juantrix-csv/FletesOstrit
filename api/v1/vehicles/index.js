import { createVehicle, getVehicleById, listVehicles } from '../../_db.js';

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
const VEHICLE_OWNERSHIP_TYPES = new Set(['owner', 'driver']);
const isVehicleOwnershipType = (value) => typeof value === 'string' && VEHICLE_OWNERSHIP_TYPES.has(value);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const vehicles = await listVehicles();
    res.status(200).json(vehicles);
    return;
  }

  if (req.method === 'POST') {
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
    const ownershipType = body.ownershipType ?? 'owner';
    if (!isVehicleOwnershipType(ownershipType)) {
      res.status(400).json({ error: 'Invalid ownershipType' });
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
      ownershipType,
      costPerKm: body.costPerKm,
      fixedMonthlyCost: body.fixedMonthlyCost,
      createdAt: body.createdAt,
      updatedAt: body.updatedAt,
    });
    res.status(201).json(created);
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
