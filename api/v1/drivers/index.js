import { createDriver, getDriverByCode, listDrivers } from '../../_db.js';

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
  if (req.method === 'GET') {
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
    if (!isNonEmptyString(body.code)) {
      res.status(400).json({ error: 'Missing code' });
      return;
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
      active: body.active ?? true,
      createdAt: body.createdAt,
      updatedAt: body.updatedAt,
    });
    res.status(201).json(created);
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
