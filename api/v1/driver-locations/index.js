import { getDriverByCode, getDriverById, listDriverLocations, upsertDriverLocation } from '../../_db.js';

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

const isFiniteNumber = (value) => Number.isFinite(value);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const locations = await listDriverLocations();
    res.status(200).json(locations);
    return;
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    const driverId = typeof body.driverId === 'string' ? body.driverId.trim() : '';
    const driverCode = typeof body.driverCode === 'string' ? body.driverCode.trim().toUpperCase() : '';
    if (!isFiniteNumber(body.lat) || !isFiniteNumber(body.lng)) {
      res.status(400).json({ error: 'Invalid coordinates' });
      return;
    }
    let driver = null;
    if (driverId) {
      driver = await getDriverById(driverId);
    }
    if (!driver && driverCode) {
      driver = await getDriverByCode(driverCode);
    }
    if (!driver) {
      res.status(400).json({ error: 'Invalid driver' });
      return;
    }
    const updated = await upsertDriverLocation({
      driverId: driver.id,
      lat: body.lat,
      lng: body.lng,
      accuracy: body.accuracy,
      heading: body.heading,
      speed: body.speed,
      jobId: body.jobId ?? null,
    });
    res.status(200).json(updated);
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
