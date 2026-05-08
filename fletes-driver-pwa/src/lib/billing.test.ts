import { describe, expect, it } from 'vitest';
import { getBilledHoursFromDurationMs, getBilledHoursFromMinutes } from './billing';

describe('billing', () => {
  it('keeps the minimum charge at one hour through the first hour', () => {
    expect(getBilledHoursFromMinutes(1)).toBe(1);
    expect(getBilledHoursFromMinutes(60)).toBe(1);
  });

  it('moves to the next half-hour block every 30 minutes after the 10 minute grace', () => {
    expect(getBilledHoursFromMinutes(71)).toBe(1.5);
    expect(getBilledHoursFromMinutes(100)).toBe(1.5);
    expect(getBilledHoursFromMinutes(101)).toBe(2);
    expect(getBilledHoursFromMinutes(130)).toBe(2);
    expect(getBilledHoursFromMinutes(131)).toBe(2.5);
    expect(getBilledHoursFromMinutes(160)).toBe(2.5);
    expect(getBilledHoursFromMinutes(161)).toBe(3);
  });

  it('supports millisecond durations', () => {
    expect(getBilledHoursFromDurationMs(60 * 60 * 1000)).toBe(1);
    expect(getBilledHoursFromDurationMs(61 * 60 * 1000)).toBe(2);
    expect(getBilledHoursFromDurationMs(4 * 60 * 60 * 1000)).toBe(4);
    expect(getBilledHoursFromDurationMs((4 * 60 * 60 * 1000) + 1)).toBe(5);
  });
});
