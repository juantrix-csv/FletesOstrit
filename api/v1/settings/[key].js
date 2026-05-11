import { getSetting, setSetting } from '../../_db.js';

const INVALID_SETTING = Symbol('invalid');

const isLocation = (value) => (
  value &&
  typeof value.address === 'string' &&
  value.address.trim().length > 0 &&
  Number.isFinite(value.lat) &&
  Number.isFinite(value.lng)
);

const isMonthCostMap = (value) => (
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.entries(value).every(([key, cost]) => (
    /^\d{4}-\d{2}$/.test(key) &&
    Number.isFinite(cost) &&
    cost >= 0
  ))
);

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

const parseSettingValue = (key, value) => {
  if (key === 'operationsBaseLocation') {
    if (value == null || value === '') return null;
    if (!isLocation(value)) return INVALID_SETTING;
    return {
      address: value.address.trim(),
      lat: Number(value.lat),
      lng: Number(value.lng),
    };
  }
  if (key === 'advertisingMonthlyCosts') {
    if (value == null || value === '') return {};
    if (!isMonthCostMap(value)) return INVALID_SETTING;
    return Object.fromEntries(
      Object.entries(value).map(([monthKey, cost]) => [monthKey, Number(cost)]),
    );
  }
  if (value == null || value === '') return null;
  if (!Number.isFinite(value)) return NaN;
  if (key === 'ownerVehicleDriverShare' || key === 'driverVehicleDriverShare') {
    if (value < 0 || value > 1) return NaN;
    return value;
  }
  if (value < 0) return NaN;
  return value;
};

const resolveSettingKey = (raw) => {
  if (raw === 'hourly-rate') return 'hourlyRate';
  if (raw === 'helper-hourly-rate') return 'helperHourlyRate';
  if (raw === 'fixed-monthly-cost') return 'fixedMonthlyCost';
  if (raw === 'advertising-monthly-cost') return 'advertisingMonthlyCost';
  if (raw === 'advertising-monthly-costs') return 'advertisingMonthlyCosts';
  if (raw === 'trip-cost-per-hour') return 'tripCostPerHour';
  if (raw === 'trip-cost-per-km') return 'tripCostPerKm';
  if (raw === 'owner-vehicle-driver-share') return 'ownerVehicleDriverShare';
  if (raw === 'driver-vehicle-driver-share') return 'driverVehicleDriverShare';
  if (raw === 'driver-vehicle-company-hourly-margin') return 'driverVehicleCompanyHourlyMargin';
  if (raw === 'operations-base-location') return 'operationsBaseLocation';
  return null;
};

const resolveBodyValue = (body) => {
  if (body && Object.prototype.hasOwnProperty.call(body, 'value')) return body.value;
  if (body && Object.prototype.hasOwnProperty.call(body, 'costs')) return body.costs;
  if (body && Object.prototype.hasOwnProperty.call(body, 'hourlyRate')) return body.hourlyRate;
  if (body && Object.prototype.hasOwnProperty.call(body, 'location')) return body.location;
  return undefined;
};

const respondSetting = (res, key, stored) => {
  if (key === 'operationsBaseLocation') {
    res.status(200).json({ location: isLocation(stored) ? stored : null });
    return;
  }
  if (key === 'advertisingMonthlyCosts') {
    res.status(200).json({ costs: isMonthCostMap(stored) ? stored : {} });
    return;
  }
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
    const parsed = parseSettingValue(key, resolveBodyValue(body));
    if (parsed === INVALID_SETTING || Number.isNaN(parsed)) {
      res.status(400).json({ error: 'Invalid value' });
      return;
    }
    const saved = await setSetting(key, parsed);
    respondSetting(res, key, saved);
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
