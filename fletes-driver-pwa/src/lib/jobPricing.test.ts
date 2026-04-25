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
    expect(breakdown.billedHours).toBe(1.5);
    expect(breakdown.baseAmount).toBe(1500);
    expect(breakdown.helpersAmount).toBe(0);
    expect(breakdown.computedTotal).toBe(1500);
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
});
