import { randomUUID } from 'node:crypto';
import {
  createDriver,
  createJob,
  getSetting,
  listCompletedJobs,
  listDrivers,
} from '../../../_db.js';

const parseTimestampMs = (value) => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

const getJobStartMs = (job) =>
  parseTimestampMs(job.timestamps?.startJobAt)
  ?? parseTimestampMs(job.timestamps?.startLoadingAt)
  ?? parseTimestampMs(job.timestamps?.startTripAt)
  ?? parseTimestampMs(job.timestamps?.startUnloadingAt)
  ?? null;

const getJobEndMs = (job) =>
  parseTimestampMs(job.timestamps?.endUnloadingAt)
  ?? parseTimestampMs(job.timestamps?.endTripAt)
  ?? null;

const csvValue = (value) => {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const buildDriverCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

const formatDate = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTime = (date) => {
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${hour}:${minute}`;
};

const buildDoneJob = ({
  clientName,
  description,
  pickup,
  dropoff,
  daysAgo,
  durationMinutes,
  helpersCount,
  driverId,
}) => {
  const end = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const start = new Date(end.getTime() - durationMinutes * 60 * 1000);
  const startLoadingAt = new Date(start.getTime() + 5 * 60 * 1000);
  const endLoadingAt = new Date(startLoadingAt.getTime() + 10 * 60 * 1000);
  const endTripAt = new Date(end.getTime() - 8 * 60 * 1000);
  const startUnloadingAt = endTripAt;

  return {
    id: randomUUID(),
    clientName,
    description,
    pickup,
    dropoff,
    extraStops: [],
    helpersCount,
    driverId,
    status: 'DONE',
    timestamps: {
      startJobAt: start.toISOString(),
      startLoadingAt: startLoadingAt.toISOString(),
      endLoadingAt: endLoadingAt.toISOString(),
      startTripAt: endLoadingAt.toISOString(),
      endTripAt: endTripAt.toISOString(),
      startUnloadingAt: startUnloadingAt.toISOString(),
      endUnloadingAt: end.toISOString(),
    },
    scheduledDate: formatDate(start),
    scheduledTime: formatTime(start),
    createdAt: start.toISOString(),
    updatedAt: end.toISOString(),
  };
};

const handleExport = async (res) => {
  const completed = await listCompletedJobs();
  const drivers = await listDrivers();
  const driversById = new Map(drivers.map((driver) => [driver.id, driver]));
  const storedRate = await getSetting('hourlyRate');
  const hourlyRate = typeof storedRate === 'number' && Number.isFinite(storedRate) ? storedRate : null;
  const storedHelperRate = await getSetting('helperHourlyRate');
  const helperHourlyRate = typeof storedHelperRate === 'number' && Number.isFinite(storedHelperRate) ? storedHelperRate : null;

  const header = [
    'job_id',
    'client_name',
    'driver_name',
    'description',
    'helpers_count',
    'pickup_address',
    'dropoff_address',
    'scheduled_date',
    'scheduled_time',
    'start_time',
    'end_time',
    'duration_minutes',
    'duration_hours',
    'hourly_rate',
    'total_value',
    'helper_hourly_rate',
    'helpers_total_value',
    'total_with_helpers',
    'created_at',
    'updated_at',
  ];

  const rows = [header];

  completed.forEach((job) => {
    const startMs = getJobStartMs(job);
    const endMs = getJobEndMs(job);
    const durationMs = startMs != null && endMs != null ? Math.max(0, endMs - startMs) : null;
    const durationMinutes = durationMs != null ? Math.round(durationMs / 60000) : null;
    const durationHours = durationMs != null ? Number((durationMs / 3600000).toFixed(2)) : null;
    const totalValue = hourlyRate != null && durationMs != null ? Number(((durationMs / 3600000) * hourlyRate).toFixed(2)) : null;
    const helpersCount = Number.isFinite(job.helpersCount) ? job.helpersCount : 0;
    const helpersTotalValue = helperHourlyRate != null && durationMs != null && helpersCount > 0
      ? Number(((durationMs / 3600000) * helperHourlyRate * helpersCount).toFixed(2))
      : null;
    const totalWithHelpers = totalValue != null && helpersTotalValue != null
      ? Number((totalValue + helpersTotalValue).toFixed(2))
      : totalValue ?? helpersTotalValue;
    const driverName = job.driverId ? driversById.get(job.driverId)?.name ?? '' : '';

    rows.push([
      job.id,
      job.clientName,
      driverName,
      job.description ?? '',
      helpersCount,
      job.pickup?.address ?? '',
      job.dropoff?.address ?? '',
      job.scheduledDate ?? '',
      job.scheduledTime ?? '',
      startMs != null ? new Date(startMs).toISOString() : '',
      endMs != null ? new Date(endMs).toISOString() : '',
      durationMinutes,
      durationHours,
      hourlyRate,
      totalValue,
      helperHourlyRate,
      helpersTotalValue,
      totalWithHelpers,
      job.createdAt,
      job.updatedAt,
    ]);
  });

  const csv = rows.map((row) => row.map(csvValue).join(',')).join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="historial-fletes.csv"');
  res.status(200).send(csv);
};

const handleSeed = async (req, res) => {
  const force = req.query?.force === '1' || req.query?.force === 'true';
  const existing = await listCompletedJobs();
  if (existing.length > 0 && !force) {
    res.status(200).json({ seeded: false, count: existing.length });
    return;
  }

  const drivers = await listDrivers();
  const driver = drivers[0]
    ?? await createDriver({
      id: randomUUID(),
      name: 'Conductor Demo',
      code: buildDriverCode(),
      phone: null,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

  const pickupA = { address: 'Plaza Moreno, La Plata', lat: -34.9212, lng: -57.9545 };
  const dropoffA = { address: 'Estacion de La Plata', lat: -34.9089, lng: -57.9508 };
  const pickupB = { address: 'City Bell', lat: -34.8631, lng: -58.0509 };
  const dropoffB = { address: 'Gonnet', lat: -34.8547, lng: -58.0159 };
  const pickupC = { address: 'Universidad Nacional de La Plata', lat: -34.9205, lng: -57.9536 };
  const dropoffC = { address: 'Terminal de Omnibus La Plata', lat: -34.9131, lng: -57.9507 };

  const jobs = [
    buildDoneJob({
      clientName: 'Prueba Historial 1',
      description: 'Mudanza chica',
      pickup: pickupA,
      dropoff: dropoffA,
      daysAgo: 1,
      durationMinutes: 70,
      helpersCount: 1,
      driverId: driver.id,
    }),
    buildDoneJob({
      clientName: 'Prueba Historial 2',
      description: 'Flete con paradas',
      pickup: pickupB,
      dropoff: dropoffB,
      daysAgo: 3,
      durationMinutes: 55,
      helpersCount: 2,
      driverId: driver.id,
    }),
    buildDoneJob({
      clientName: 'Prueba Historial 3',
      description: 'Entrega express',
      pickup: pickupC,
      dropoff: dropoffC,
      daysAgo: 6,
      durationMinutes: 95,
      helpersCount: 0,
      driverId: null,
    }),
  ];

  await Promise.all(jobs.map((job) => createJob(job)));
  res.status(200).json({ seeded: true, count: jobs.length });
};

export default async function handler(req, res) {
  const action = req.query?.action;
  if (action === 'export') {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    await handleExport(res);
    return;
  }

  if (action === 'seed') {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    await handleSeed(req, res);
    return;
  }

  res.status(404).json({ error: 'Not found' });
}
