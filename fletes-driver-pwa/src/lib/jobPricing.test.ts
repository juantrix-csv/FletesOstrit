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
    startJobAt: '2026-01-01T09:40:00.000Z',
    startLoadingAt: '2026-01-01T10:00:00.000Z',
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
    expect(breakdown.billedHours).toBe(2);
    expect(breakdown.baseAmount).toBe(2000);
    expect(breakdown.helpersAmount).toBe(0);
    expect(breakdown.computedTotal).toBe(2000);
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
    expect(breakdown.billedHours).toBe(2);
    expect(breakdown.computedTotal).toBe(2000);
  });

  it('starts charging from arrival at pickup when both start timestamps exist', () => {
    const breakdown = getJobChargeBreakdown(makeJob({
      timestamps: {
        startJobAt: '2026-01-01T09:30:00.000Z',
        startLoadingAt: '2026-01-01T10:00:00.000Z',
        endUnloadingAt: '2026-01-01T11:00:00.000Z',
      },
    }), {
      hourlyRate: 1000,
      helperHourlyRate: null,
      distantBaseTravelMinutes: null,
      distantBasePoint: null,
    });

    expect(breakdown.durationMs).toBe(60 * 60 * 1000);
    expect(breakdown.billedHours).toBe(1);
  });

  it('charges a four-hour job as four full hours', () => {
    const breakdown = getJobChargeBreakdown(makeJob({
      timestamps: {
        startLoadingAt: '2026-01-01T10:00:00.000Z',
        endUnloadingAt: '2026-01-01T14:00:00.000Z',
      },
    }), {
      hourlyRate: 1000,
      helperHourlyRate: null,
      distantBaseTravelMinutes: null,
      distantBasePoint: null,
    });

    expect(breakdown.durationMs).toBe(4 * 60 * 60 * 1000);
    expect(breakdown.billedHours).toBe(4);
    expect(breakdown.baseAmount).toBe(4000);
    expect(breakdown.computedTotal).toBe(4000);
  });

  it('shows the driver a four-hour total including helpers', () => {
    const breakdown = getJobChargeBreakdown(makeJob({
      helpersCount: 2,
      timestamps: {
        startLoadingAt: '2026-01-01T10:00:00.000Z',
        endUnloadingAt: '2026-01-01T14:00:00.000Z',
      },
    }), {
      hourlyRate: 1000,
      helperHourlyRate: 250,
      distantBaseTravelMinutes: null,
      distantBasePoint: null,
    });

    expect(breakdown.billedHours).toBe(4);
    expect(breakdown.baseAmount).toBe(4000);
    expect(breakdown.helpersAmount).toBe(2000);
    expect(breakdown.computedTotal).toBe(6000);
    expect(breakdown.totalAmount).toBe(6000);
    expect(breakdown.source).toBe('computed');
  });

  it('rounds a four-hour job with one extra minute up to five hours', () => {
    const breakdown = getJobChargeBreakdown(makeJob({
      timestamps: {
        startLoadingAt: '2026-01-01T10:00:00.000Z',
        endUnloadingAt: '2026-01-01T14:01:00.000Z',
      },
    }), {
      hourlyRate: 1000,
      helperHourlyRate: null,
      distantBaseTravelMinutes: null,
      distantBasePoint: null,
    });

    expect(breakdown.durationMs).toBe((4 * 60 + 1) * 60 * 1000);
    expect(breakdown.billedHours).toBe(5);
    expect(breakdown.computedTotal).toBe(5000);
  });
});
