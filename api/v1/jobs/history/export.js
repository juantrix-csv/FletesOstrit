import { getSetting, listCompletedJobs, listDrivers } from '../../../_db.js';

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

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

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
}
