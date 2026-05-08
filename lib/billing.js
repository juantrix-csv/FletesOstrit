export const BILLING_FIRST_HOUR_MINUTES = 60;
export const BILLING_GRACE_MINUTES = 10;
export const BILLING_STEP_MINUTES = 30;
export const BILLING_STEP_HOURS = 0.5;

export const getBilledHoursFromMinutes = (durationMinutes) => {
  if (durationMinutes == null || !Number.isFinite(durationMinutes)) return null;
  if (durationMinutes <= 0) return 0;

  const firstHourThresholdMinutes = BILLING_FIRST_HOUR_MINUTES + BILLING_GRACE_MINUTES;
  if (durationMinutes <= firstHourThresholdMinutes) return 1;

  const extraBlocks = Math.ceil((durationMinutes - firstHourThresholdMinutes) / BILLING_STEP_MINUTES);
  return 1 + extraBlocks * BILLING_STEP_HOURS;
};

export const getBilledHoursFromDurationMs = (durationMs) => {
  if (durationMs == null || !Number.isFinite(durationMs)) return null;
  if (durationMs <= 0) return 0;
  return getBilledHoursFromMinutes(durationMs / 60000);
};
