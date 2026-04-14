import {
  authorizeFinanceRead,
  buildFinanceResponse,
  FINANCE_SETTING_KEYS,
  resolveFinanceFilters,
} from '../../../lib/financeAccess.js';
import {
  getSetting,
  listDrivers,
  listJobs,
  listLeads,
  listVehicles,
} from '../../_db.js';

const loadFinanceSettings = async () => {
  const entries = await Promise.all(
    FINANCE_SETTING_KEYS.map(async (key) => [key, await getSetting(key)]),
  );
  return Object.fromEntries(entries);
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const auth = authorizeFinanceRead(req);
  if (!auth.ok) {
    res.status(auth.status).json({ error: auth.error });
    return;
  }

  const resource = req.query?.resource ?? 'snapshot';
  const [jobs, drivers, vehicles, leads, settings] = await Promise.all([
    listJobs(),
    listDrivers(),
    listVehicles(),
    listLeads(),
    loadFinanceSettings(),
  ]);
  const payload = buildFinanceResponse(resource, {
    jobs,
    drivers,
    vehicles,
    leads,
    settings,
    filters: resolveFinanceFilters(req.query),
  });

  if (!payload) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  res.status(200).json(payload);
}
