import { randomUUID } from 'node:crypto';
import {
  createDriver,
  createJob,
  getSetting,
  listCompletedJobs,
  listDrivers,
  listVehicles,
} from '../../../_db.js';
import { buildJobsHistoryCsv } from '../../../../lib/jobHistoryExport.js';

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
  endAt,
  durationMinutes,
  helpersCount,
  driverId,
}) => {
  const end = endAt instanceof Date
    ? endAt
    : new Date(Date.now() - (daysAgo ?? 0) * 24 * 60 * 60 * 1000);
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
  const vehicles = await listVehicles();
  const storedRate = await getSetting('hourlyRate');
  const hourlyRate = typeof storedRate === 'number' && Number.isFinite(storedRate) ? storedRate : null;
  const storedHelperRate = await getSetting('helperHourlyRate');
  const helperHourlyRate = typeof storedHelperRate === 'number' && Number.isFinite(storedHelperRate) ? storedHelperRate : null;
  const csv = buildJobsHistoryCsv({
    jobs: completed,
    drivers,
    vehicles,
    hourlyRate,
    helperHourlyRate,
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="historial-fletes.csv"');
  res.status(200).send(csv);
};

const handleSeed = async (req, res) => {
  const force = req.query?.force === '1' || req.query?.force === 'true';
  const append = req.query?.append === '1' || req.query?.append === 'true';
  const existing = await listCompletedJobs();
  if (existing.length > 0 && !force && !append) {
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

  const templates = [
    { clientName: 'Prueba Historial A', description: 'Mudanza chica', pickup: pickupA, dropoff: dropoffA, helpersCount: 1 },
    { clientName: 'Prueba Historial B', description: 'Flete con paradas', pickup: pickupB, dropoff: dropoffB, helpersCount: 2 },
    { clientName: 'Prueba Historial C', description: 'Entrega express', pickup: pickupC, dropoff: dropoffC, helpersCount: 0 },
    { clientName: 'Prueba Historial D', description: 'Mudanza completa', pickup: pickupB, dropoff: dropoffA, helpersCount: 3 },
    { clientName: 'Prueba Historial E', description: 'Traslado urgente', pickup: pickupA, dropoff: dropoffC, helpersCount: 0 },
  ];
  const durationOptions = [35, 50, 65, 80, 95, 120, 140];
  const months = Math.min(12, Math.max(1, Number.parseInt(req.query?.months ?? '6', 10) || 6));
  const perMonth = Math.min(8, Math.max(1, Number.parseInt(req.query?.perMonth ?? '4', 10) || 4));
  const msInDay = 24 * 60 * 60 * 1000;
  const now = new Date();
  const jobs = [];

  for (let monthOffset = 0; monthOffset < months; monthOffset += 1) {
    const baseDate = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
    for (let idx = 0; idx < perMonth; idx += 1) {
      const template = templates[(monthOffset * perMonth + idx) % templates.length];
      const day = 2 + ((idx * 6 + monthOffset * 3) % 24);
      const hour = 8 + ((idx * 3) % 9);
      const minute = (idx * 13) % 60;
      const endDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), day, hour, minute, 0, 0);
      const durationMinutes = durationOptions[(idx + monthOffset) % durationOptions.length];
      jobs.push(buildDoneJob({
        clientName: template.clientName,
        description: template.description,
        pickup: template.pickup,
        dropoff: template.dropoff,
        endAt: endDate,
        durationMinutes,
        helpersCount: template.helpersCount,
        driverId: (idx + monthOffset) % 5 === 0 ? null : driver.id,
      }));
    }
  }

  await Promise.all(jobs.map((job) => createJob(job)));
  res.status(200).json({
    seeded: true,
    count: jobs.length,
    months,
    perMonth,
    totalExisting: existing.length,
  });
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
