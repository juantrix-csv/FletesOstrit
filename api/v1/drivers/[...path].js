import {
  createDriver,
  deleteDriver,
  getDriverByCode,
  getVehicleById,
  listDrivers,
  updateDriver,
} from '../../_db.js';

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

export default async function handler(req, res) {
  const pathParam = req.query.path;
  const id = Array.isArray(pathParam) ? pathParam[0] : (typeof pathParam === 'string' ? pathParam : null);
  const hasId = Boolean(id);

  if (!hasId && req.method === 'GET') {
    const code = typeof req.query.code === 'string' ? req.query.code.trim() : null;
    if (code) {
      const driver = await getDriverByCode(code.toUpperCase());
      if (!driver) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.status(200).json(driver);
      return;
    }
    const drivers = await listDrivers();
    res.status(200).json(drivers);
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
    if (!isNonEmptyString(body.code)) {
      res.status(400).json({ error: 'Missing code' });
      return;
    }
    let vehicleId = null;
    if (body.vehicleId != null) {
      if (!isNonEmptyString(body.vehicleId)) {
        res.status(400).json({ error: 'Invalid vehicle' });
        return;
      }
      const vehicle = await getVehicleById(body.vehicleId);
      if (!vehicle) {
        res.status(400).json({ error: 'Invalid vehicle' });
        return;
      }
      vehicleId = vehicle.id;
    }
    const normalizedCode = body.code.trim().toUpperCase();
    const exists = await getDriverByCode(normalizedCode);
    if (exists) {
      res.status(409).json({ error: 'Code already in use' });
      return;
    }
    const created = await createDriver({
      id: body.id,
      name: body.name,
      code: normalizedCode,
      phone: body.phone,
      vehicleId,
      active: body.active ?? true,
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
    const updated = await updateDriver(id, body);
    if (!updated) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json(updated);
    return;
  }

  if (hasId && req.method === 'DELETE') {
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
