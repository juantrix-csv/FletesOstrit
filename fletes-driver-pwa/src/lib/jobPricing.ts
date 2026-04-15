import type { Job } from './types';
import { getBilledHoursFromDurationMs } from './billing';

export const DISTANT_BASE_THRESHOLD_MINUTES = 15;

export const moneyFormatter = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const roundMoney = (value: number) => Number(value.toFixed(2));
const toMoneyOrNull = (value?: number | null) => (Number.isFinite(value) ? Number(value) : null);
const toCeiledPositiveMinutesOrNull = (value?: number | null) => (
  Number.isFinite(value) && Number(value) > 0 ? Math.max(1, Math.ceil(Number(value))) : null
);

export const parseTimestampMs = (value?: string) => {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
};

export const getJobStartMs = (job: Job) =>
  parseTimestampMs(job.timestamps.startJobAt)
  ?? parseTimestampMs(job.timestamps.startLoadingAt)
  ?? parseTimestampMs(job.timestamps.startTripAt)
  ?? parseTimestampMs(job.timestamps.startUnloadingAt)
  ?? null;

export const getJobEndMs = (job: Job) =>
  parseTimestampMs(job.timestamps.endUnloadingAt)
  ?? parseTimestampMs(job.timestamps.endTripAt)
  ?? null;

export const getJobDurationMs = (job: Job, endAtMs?: number | null) => {
  const startMs = getJobStartMs(job);
  const resolvedEndMs = endAtMs ?? getJobEndMs(job);
  if (startMs == null || resolvedEndMs == null) return null;
  return Math.max(0, resolvedEndMs - startMs);
};

export const formatDurationMs = (ms: number) => {
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes} min`;
};

export const formatBilledHours = (hours: number) => {
  if (Number.isInteger(hours)) return `${hours} h`;
  return `${hours.toFixed(1).replace(/\.0$/, '')} h`;
};

export const getJobChargeBreakdown = (
  job: Job,
  opts: {
    hourlyRate: number | null;
    helperHourlyRate: number | null;
    endAtMs?: number | null;
    distantBaseTravelMinutes?: number | null;
    distantBasePoint?: 'pickup' | 'dropoff' | null;
  },
) => {
  const durationMs = getJobDurationMs(job, opts.endAtMs);
  const distantBaseTravelMinutes = toCeiledPositiveMinutesOrNull(opts.distantBaseTravelMinutes);
  const distantBaseExtraMinutes = distantBaseTravelMinutes != null
    && distantBaseTravelMinutes > DISTANT_BASE_THRESHOLD_MINUTES
    ? distantBaseTravelMinutes
    : 0;
  const distantBaseExtraMs = distantBaseExtraMinutes * 60000;
  const chargeableDurationMs = durationMs != null ? durationMs + distantBaseExtraMs : null;
  const billedHours = getBilledHoursFromDurationMs(chargeableDurationMs);
  const helpersCount = Math.max(0, Number.isFinite(job.helpersCount) ? Number(job.helpersCount) : 0);
  const baseAmount = opts.hourlyRate != null && billedHours != null
    ? roundMoney(billedHours * opts.hourlyRate)
    : null;
  const helpersAmount = opts.helperHourlyRate != null && billedHours != null && helpersCount > 0
    ? roundMoney(billedHours * opts.helperHourlyRate * helpersCount)
    : 0;
  const computedTotal = baseAmount != null ? roundMoney(baseAmount + helpersAmount) : null;
  const storedTotal = toMoneyOrNull(job.chargedAmount);
  const useStoredTotal = storedTotal != null && (computedTotal == null || Math.abs(storedTotal - computedTotal) >= 0.01);

  return {
    durationMs,
    distantBaseTravelMinutes,
    distantBaseExtraMinutes,
    distantBaseExtraMs,
    distantBasePoint: opts.distantBasePoint ?? null,
    chargeableDurationMs,
    billedHours,
    helpersCount,
    baseAmount,
    helpersAmount,
    computedTotal,
    storedTotal,
    totalAmount: useStoredTotal ? storedTotal : computedTotal,
    source: useStoredTotal ? 'stored' : computedTotal != null ? 'computed' : storedTotal != null ? 'stored' : 'unavailable',
  };
};
