import { describe, expect, it } from 'vitest';
import { getJobChargeBreakdown } from './jobPricing';
import type { Job } from './types';

const makeJob = (overrides: Partial<Job> = {}): Job => ({
  id: 'job-1',
  clientName: 'Cliente',
  pickup: { address: 'Origen', lat: -34.6, lng: -58.4 },
  dropoff: { address: 'Destino', lat: -34.7, lng: -58.5 },
  status: 'UNLOADING',
  flags: {
    nearPickupSent: false,
    arrivedPickupSent: false,
    nearDropoffSent: false,
    arrivedDropoffSent: false,
  },
  timestamps: {
    startJobAt: '2026-01-01T10:00:00.000Z',
    endUnloadingAt: '2026-01-01T11:00:00.000Z',
  },
  createdAt: '2026-01-01T09:00:00.000Z',
  updatedAt: '2026-01-01T11:00:00.000Z',
  ...overrides,
});

describe('job pricing', () => {
  it('does not add distant base time at or below 15 minutes', () => {
    const breakdown = getJobChargeBreakdown(makeJob(), {
      hourlyRate: 1000,
      helperHourlyRate: null,
      distantBaseTravelMinutes: 15,
      distantBasePoint: 'dropoff',
    });

    expect(breakdown.distantBaseExtraMinutes).toBe(0);
    expect(breakdown.chargeableDurationMs).toBe(60 * 60 * 1000);
    expect(breakdown.billedHours).toBe(1);
    expect(breakdown.baseAmount).toBe(1000);
    expect(breakdown.computedTotal).toBe(1000);
  });

  it('adds the full distant base time before applying the billing round-up', () => {
    const breakdown = getJobChargeBreakdown(makeJob(), {
      hourlyRate: 1000,
      helperHourlyRate: 200,
      distantBaseTravelMinutes: 16,
      distantBasePoint: 'pickup',
    });

    expect(breakdown.distantBaseExtraMinutes).toBe(16);
    expect(breakdown.chargeableDurationMs).toBe(76 * 60 * 1000);
    expect(breakdown.billedHours).toBe(1.5);
    expect(breakdown.baseAmount).toBe(1500);
    expect(breakdown.helpersAmount).toBe(0);
    expect(breakdown.computedTotal).toBe(1500);
  });

  it('adds helper charges to the final computed total', () => {
    const breakdown = getJobChargeBreakdown(makeJob({ helpersCount: 2 }), {
      hourlyRate: 10000,
      helperHourlyRate: 2500,
    });

    expect(breakdown.billedHours).toBe(1);
    expect(breakdown.baseAmount).toBe(10000);
    expect(breakdown.helpersAmount).toBe(5000);
    expect(breakdown.computedTotal).toBe(15000);
    expect(breakdown.totalAmount).toBe(15000);
    expect(breakdown.source).toBe('computed');
  });

  it('uses a materially different stored total when the completed job already has one', () => {
    const breakdown = getJobChargeBreakdown(makeJob({ chargedAmount: 18000 }), {
      hourlyRate: 10000,
      helperHourlyRate: 2500,
    });

    expect(breakdown.computedTotal).toBe(10000);
    expect(breakdown.storedTotal).toBe(18000);
    expect(breakdown.totalAmount).toBe(18000);
    expect(breakdown.source).toBe('stored');
  });

  it('falls back across job timestamps and clamps negative durations to zero', () => {
    const breakdown = getJobChargeBreakdown(makeJob({
      timestamps: {
        startTripAt: '2026-01-01T12:00:00.000Z',
        endTripAt: '2026-01-01T11:00:00.000Z',
      },
    }), {
      hourlyRate: 10000,
      helperHourlyRate: null,
    });

    expect(breakdown.durationMs).toBe(0);
    expect(breakdown.billedHours).toBe(0);
    expect(breakdown.computedTotal).toBe(0);
  });

  it('treats partial minutes above the threshold as distant base time', () => {
    const breakdown = getJobChargeBreakdown(makeJob({
      timestamps: {
        startJobAt: '2026-01-01T10:00:00.000Z',
        endUnloadingAt: '2026-01-01T10:55:00.000Z',
      },
    }), {
      hourlyRate: 1000,
      helperHourlyRate: null,
      distantBaseTravelMinutes: 15.1,
      distantBasePoint: 'dropoff',
    });

    expect(breakdown.distantBaseExtraMinutes).toBe(16);
    expect(breakdown.chargeableDurationMs).toBe(71 * 60 * 1000);
    expect(breakdown.billedHours).toBe(1.5);
    expect(breakdown.computedTotal).toBe(1500);
  });
});
