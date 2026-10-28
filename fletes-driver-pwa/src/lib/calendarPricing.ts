import type { Job } from './types';

export const getCompletedCalendarOwnerShare = (
  job: Pick<Job, 'status' | 'isLongDistance' | 'companyShareAmount'>,
): number | null => (
  job.status === 'DONE' && !job.isLongDistance && Number.isFinite(job.companyShareAmount)
    ? Number(Number(job.companyShareAmount).toFixed(2))
    : null
);
