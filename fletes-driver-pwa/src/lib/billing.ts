export const BILLING_FIRST_HOUR_MINUTES = 60;
export const BILLING_STEP_MINUTES = 60;

export const getBilledHoursFromMinutes = (durationMinutes: number | null | undefined) => {
  if (durationMinutes == null || !Number.isFinite(durationMinutes)) return null;
  if (durationMinutes <= 0) return 0;
  return Math.max(1, Math.ceil(durationMinutes / BILLING_STEP_MINUTES));
};

export const getBilledHoursFromDurationMs = (durationMs: number | null | undefined) => {
  if (durationMs == null || !Number.isFinite(durationMs)) return null;
  if (durationMs <= 0) return 0;
  return getBilledHoursFromMinutes(durationMs / 60000);
};
