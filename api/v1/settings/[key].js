import { getSetting, setSetting } from '../../_db.js';

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

const parseHourlyRate = (value) => {
  if (value == null || value === '') return null;
  if (!Number.isFinite(value) || value < 0) return NaN;
  return value;
};

const resolveSettingKey = (raw) => {
  if (raw === 'hourly-rate') return 'hourlyRate';
  if (raw === 'helper-hourly-rate') return 'helperHourlyRate';
  return null;
};

export default async function handler(req, res) {
  const key = resolveSettingKey(req.query?.key);
  if (!key) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  if (req.method === 'GET') {
    const stored = await getSetting(key);
    const hourlyRate = typeof stored === 'number' && Number.isFinite(stored) ? stored : null;
    res.status(200).json({ hourlyRate });
    return;
  }

  if (req.method === 'PUT') {
    const body = parseBody(req);
    const parsed = parseHourlyRate(body.hourlyRate);
    if (Number.isNaN(parsed)) {
      res.status(400).json({ error: 'Invalid hourlyRate' });
      return;
    }
    const saved = await setSetting(key, parsed);
    const hourlyRate = typeof saved === 'number' && Number.isFinite(saved) ? saved : null;
    res.status(200).json({ hourlyRate });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
