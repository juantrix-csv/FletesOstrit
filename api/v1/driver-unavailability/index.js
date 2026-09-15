import { createDriverUnavailability, listDriverUnavailability, listDriverUnavailabilityForDriver } from '../../_db.js';

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

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const driverId = typeof req.query.driverId === 'string' ? req.query.driverId.trim() : null;
    const slots = driverId
      ? await listDriverUnavailabilityForDriver(driverId)
      : await listDriverUnavailability();
    res.status(200).json(slots);
    return;
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    if (!isNonEmptyString(body.driverId)) {
      res.status(400).json({ error: 'Missing driverId' });
      return;
    }
    if (!isNonEmptyString(body.date) || !DATE_RE.test(body.date)) {
      res.status(400).json({ error: 'Invalid date' });
      return;
    }
    if (!isNonEmptyString(body.startTime) || !TIME_RE.test(body.startTime)) {
      res.status(400).json({ error: 'Invalid startTime' });
      return;
    }
    if (!isNonEmptyString(body.endTime) || !TIME_RE.test(body.endTime)) {
      res.status(400).json({ error: 'Invalid endTime' });
      return;
    }
    if (body.endTime <= body.startTime) {
      res.status(400).json({ error: 'endTime must be after startTime' });
      return;
    }
    const created = await createDriverUnavailability({
      id: body.id,
      driverId: body.driverId,
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
    });
    res.status(201).json(created);
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
