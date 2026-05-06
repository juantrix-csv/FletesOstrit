import { describe, expect, it } from 'vitest';
import { getBilledHoursFromDurationMs, getBilledHoursFromMinutes } from './billing';

describe('billing', () => {
  it('keeps the minimum charge at one hour through the first hour', () => {
    expect(getBilledHoursFromMinutes(1)).toBe(1);
    expect(getBilledHoursFromMinutes(60)).toBe(1);
  });

  it('rounds every started hour up to a full hour', () => {
    expect(getBilledHoursFromMinutes(61)).toBe(2);
    expect(getBilledHoursFromMinutes(85)).toBe(2);
    expect(getBilledHoursFromMinutes(120)).toBe(2);
    expect(getBilledHoursFromMinutes(121)).toBe(3);
    expect(getBilledHoursFromMinutes(240)).toBe(4);
    expect(getBilledHoursFromMinutes(241)).toBe(5);
  });

  it('does not undercharge long exact-hour jobs', () => {
    expect(getBilledHoursFromMinutes(180)).toBe(3);
    expect(getBilledHoursFromMinutes(240)).toBe(4);
    expect(getBilledHoursFromMinutes(300)).toBe(5);
    expect(getBilledHoursFromMinutes(360)).toBe(6);
  });

  it('supports millisecond durations', () => {
    expect(getBilledHoursFromDurationMs(60 * 60 * 1000)).toBe(1);
    expect(getBilledHoursFromDurationMs(61 * 60 * 1000)).toBe(2);
    expect(getBilledHoursFromDurationMs(4 * 60 * 60 * 1000)).toBe(4);
    expect(getBilledHoursFromDurationMs((4 * 60 * 60 * 1000) + 1)).toBe(5);
  });
});
