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

const parseNumber = (value) => {
  if (value == null || value === '') return null;
  if (!Number.isFinite(value) || value < 0) return NaN;
  return value;
};

const resolveSettingKey = (raw) => {
  if (raw === 'hourly-rate') return 'hourlyRate';
  if (raw === 'helper-hourly-rate') return 'helperHourlyRate';
  if (raw === 'fixed-monthly-cost') return 'fixedMonthlyCost';
  if (raw === 'trip-cost-per-hour') return 'tripCostPerHour';
  if (raw === 'trip-cost-per-km') return 'tripCostPerKm';
  return null;
};

const resolveBodyValue = (body) => {
  if (body && Object.prototype.hasOwnProperty.call(body, 'value')) return body.value;
  if (body && Object.prototype.hasOwnProperty.call(body, 'hourlyRate')) return body.hourlyRate;
  return undefined;
};

const respondSetting = (res, key, stored) => {
  const value = typeof stored === 'number' && Number.isFinite(stored) ? stored : null;
  if (key === 'hourlyRate' || key === 'helperHourlyRate') {
    res.status(200).json({ hourlyRate: value });
    return;
  }
  res.status(200).json({ value });
};

export default async function handler(req, res) {
  const key = resolveSettingKey(req.query?.key);
  if (!key) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  if (req.method === 'GET') {
    const stored = await getSetting(key);
    respondSetting(res, key, stored);
    return;
  }

  if (req.method === 'PUT') {
    const body = parseBody(req);
    const parsed = parseNumber(resolveBodyValue(body));
    if (Number.isNaN(parsed)) {
      res.status(400).json({ error: 'Invalid value' });
      return;
    }
    const saved = await setSetting(key, parsed);
    respondSetting(res, key, saved);
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
