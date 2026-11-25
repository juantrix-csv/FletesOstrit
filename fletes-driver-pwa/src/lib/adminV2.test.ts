import { describe, expect, it } from 'vitest';
import { jobCalendarAmount, jobCalendarNet, jobCollected, type CalendarCostSettings } from './adminV2';
import type { Driver, Job, Vehicle } from './types';

const driver = { id: 'driver-1', name: 'Valentín', code: '7743' } as Driver;
const vehicle = { id: 'vehicle-1', ownershipType: 'driver', companyHourlyMargin: 12000 } as Vehicle;
const job = { status: 'PENDING', driverId: driver.id, vehicleId: vehicle.id, estimatedDurationMinutes: 60 } as Job;
const costs: CalendarCostSettings = { hourlyRate: 40000, helperHourlyRate: 10000, tripCostPerHour: 0, tripCostPerKm: 0, ownerVehicleDriverShare: 1 / 3, driverVehicleDriverShare: 2 / 3 };

describe('admin V2 calendar amounts', () => {
  it('shows the configured company margin for an external driver', () => {
    expect(jobCalendarAmount(job, [driver], [vehicle])).toBe(12000);
  });

  it('shows 30% of the final client price for long distance', () => {
    expect(jobCalendarAmount({ ...job, isLongDistance: true, manualPrice: 100000 }, [driver], [vehicle])).toBe(30000);
  });

  it('uses the recorded company share after completion', () => {
    expect(jobCalendarAmount({ ...job, status: 'DONE', companyShareAmount: 14000 }, [driver], [vehicle])).toBe(14000);
  });

  it('keeps the external driver margin as daily net', () => {
    expect(jobCalendarNet(job, [driver], [vehicle], costs)).toBe(12000);
  });

  it('subtracts helper and scheduling costs from an owner trip', () => {
    const owner = { id: 'owner', name: 'Juan', code: '6666' } as Driver;
    const ownerVehicle = { id: 'owner-vehicle', ownershipType: 'owner', hourlyRate: 40000, costPerKm: 0 } as Vehicle;
    const location = { address: 'La Plata', lat: -34.9, lng: -57.9 };
    const ownerJob = { ...job, driverId: owner.id, vehicleId: ownerVehicle.id, helpersCount: 2, pickup: location, dropoff: location };
    expect(jobCalendarNet(ownerJob, [owner], [ownerVehicle], costs)).toBe(46000);
  });

  it('keeps a quoted long-distance price out of recorded collections', () => {
    expect(jobCollected({ ...job, status: 'DONE', isLongDistance: true, manualPrice: 100000 })).toBeNull();
  });
});
