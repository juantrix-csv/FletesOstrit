import { getBilledHoursFromDurationMs } from './billing.js';

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

const roundMoney = (value) => Number(Number(value).toFixed(2));

const getPaymentBreakdown = (job) => {
  const cashAmount = Number.isFinite(job.cashAmount) ? Number(job.cashAmount) : null;
  const transferAmount = Number.isFinite(job.transferAmount) ? Number(job.transferAmount) : null;
  const hasBreakdown = cashAmount != null || transferAmount != null;
  const chargedAmount = Number.isFinite(job.chargedAmount) ? Number(job.chargedAmount) : null;
  const totalBilled = hasBreakdown
    ? roundMoney((cashAmount ?? 0) + (transferAmount ?? 0))
    : chargedAmount;
  const paymentMethod = hasBreakdown
    ? cashAmount != null && transferAmount != null
      ? 'mixed'
      : cashAmount != null
        ? 'cash'
        : transferAmount != null
          ? 'transfer'
          : null
    : chargedAmount != null
      ? 'unassigned'
      : null;

  return {
    cashAmount,
    transferAmount,
    chargedAmount,
    paymentMethod,
    unassignedAmount: !hasBreakdown ? chargedAmount : null,
    totalBilled,
  };
};

export const JOB_HISTORY_CSV_HEADER = [
  'job_id',
  'client_name',
  'driver_name',
  'vehicle_name',
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
  'driver_share_ratio',
  'driver_share_amount',
  'company_share_amount',
  'share_source',
  'helper_hourly_rate',
  'helpers_total_value',
  'total_with_helpers',
  'charged_amount',
  'cash_amount',
  'transfer_amount',
  'payment_method',
  'unassigned_amount',
  'total_billed',
  'created_at',
  'updated_at',
];

export const buildJobsHistoryCsv = ({
  jobs = [],
  drivers = [],
  vehicles = [],
  hourlyRate = null,
  helperHourlyRate = null,
} = {}) => {
  const driversById = new Map(drivers.map((driver) => [driver.id, driver]));
  const vehiclesById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const rows = [JOB_HISTORY_CSV_HEADER];

  jobs.forEach((job) => {
    const startMs = getJobStartMs(job);
    const endMs = getJobEndMs(job);
    const durationMs = startMs != null && endMs != null ? Math.max(0, endMs - startMs) : null;
    const durationMinutes = durationMs != null ? Math.round(durationMs / 60000) : null;
    const durationHours = durationMs != null ? Number((durationMs / 3600000).toFixed(2)) : null;
    const billedHours = getBilledHoursFromDurationMs(durationMs);
    const driver = job.driverId ? driversById.get(job.driverId) ?? null : null;
    const vehicle = job.vehicleId
      ? vehiclesById.get(job.vehicleId) ?? null
      : driver?.vehicleId
        ? vehiclesById.get(driver.vehicleId) ?? null
        : null;
    const effectiveHourlyRate = Number.isFinite(job.hourlyRateSnapshot)
      ? job.hourlyRateSnapshot
      : Number.isFinite(vehicle?.hourlyRate)
        ? Number(vehicle.hourlyRate)
        : hourlyRate;
    const totalValue = Number.isFinite(job.hourlyBaseAmount)
      ? job.hourlyBaseAmount
      : effectiveHourlyRate != null && billedHours != null
        ? Number((billedHours * effectiveHourlyRate).toFixed(2))
        : null;
    const driverShareRatio = Number.isFinite(job.driverShareRatio) ? job.driverShareRatio : null;
    const driverShareAmount = Number.isFinite(job.driverShareAmount) ? job.driverShareAmount : null;
    const companyShareAmount = Number.isFinite(job.companyShareAmount) ? job.companyShareAmount : null;
    const shareSource = typeof job.shareSource === 'string' ? job.shareSource : null;
    const helpersCount = Number.isFinite(job.helpersCount) ? job.helpersCount : 0;
    const effectiveHelperRate = Number.isFinite(job.helperHourlyRateSnapshot)
      ? job.helperHourlyRateSnapshot
      : helperHourlyRate;
    const helpersTotalValue = effectiveHelperRate != null && billedHours != null && helpersCount > 0
      ? Number((billedHours * effectiveHelperRate * helpersCount).toFixed(2))
      : null;
    const totalWithHelpers = totalValue != null && helpersTotalValue != null
      ? Number((totalValue + helpersTotalValue).toFixed(2))
      : totalValue ?? helpersTotalValue;
    const payment = getPaymentBreakdown(job);
    const totalBilled = payment.totalBilled != null ? payment.totalBilled : totalWithHelpers;

    rows.push([
      job.id,
      job.clientName,
      driver?.name ?? '',
      vehicle?.name ?? '',
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
      effectiveHourlyRate,
      totalValue,
      driverShareRatio,
      driverShareAmount,
      companyShareAmount,
      shareSource,
      helperHourlyRate,
      helpersTotalValue,
      totalWithHelpers,
      payment.chargedAmount,
      payment.cashAmount,
      payment.transferAmount,
      payment.paymentMethod,
      payment.unassignedAmount,
      totalBilled,
      job.createdAt,
      job.updatedAt,
    ]);
  });

  return rows.map((row) => row.map(csvValue).join(',')).join('\n');
};
