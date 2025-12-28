import { randomUUID } from 'node:crypto';
import { createDriver, createJob, listCompletedJobs, listDrivers } from '../../../_db.js';

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

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

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
}
