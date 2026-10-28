import { describe, expect, it } from 'vitest';
import { getCompletedCalendarOwnerShare } from './calendarPricing';

describe('calendar owner amount', () => {
  it('uses the completed job share even when its estimated duration was longer', () => {
    const job = {
      status: 'DONE' as const,
      isLongDistance: false,
      estimatedDurationMinutes: 90,
      chargedAmount: 40000,
      companyShareAmount: 12000,
    };

    expect(getCompletedCalendarOwnerShare(job)).toBe(12000);
  });

  it('keeps pending and long-distance jobs on their own pricing rules', () => {
    expect(getCompletedCalendarOwnerShare({ status: 'PENDING', isLongDistance: false, companyShareAmount: 12000 })).toBeNull();
    expect(getCompletedCalendarOwnerShare({ status: 'DONE', isLongDistance: true, companyShareAmount: 12000 })).toBeNull();
  });
});
