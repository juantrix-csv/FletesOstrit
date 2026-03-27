import { describe, expect, it } from 'vitest';
import { getBilledHoursFromDurationMs, getBilledHoursFromMinutes } from './billing';

describe('billing', () => {
  it('keeps the minimum charge at one hour until 70 minutes', () => {
    expect(getBilledHoursFromMinutes(1)).toBe(1);
    expect(getBilledHoursFromMinutes(60)).toBe(1);
    expect(getBilledHoursFromMinutes(70)).toBe(1);
  });

  it('moves to the next half-hour block after the 10 minute grace', () => {
    expect(getBilledHoursFromMinutes(71)).toBe(1.5);
    expect(getBilledHoursFromMinutes(130)).toBe(1.5);
    expect(getBilledHoursFromMinutes(131)).toBe(2);
    expect(getBilledHoursFromMinutes(190)).toBe(2);
    expect(getBilledHoursFromMinutes(191)).toBe(2.5);
  });

  it('supports millisecond durations', () => {
    expect(getBilledHoursFromDurationMs(70 * 60 * 1000)).toBe(1);
    expect(getBilledHoursFromDurationMs(71 * 60 * 1000)).toBe(1.5);
  });
});
