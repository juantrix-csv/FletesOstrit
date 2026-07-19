import { describe, expect, it } from 'vitest';
import { formatJobAccessSummary, formatLocationAccess, normalizeLocationAccess } from './locationAccess';

describe('location access', () => {
  it('defaults legacy locations to ground floor without elevator', () => {
    expect(normalizeLocationAccess({ address: 'A', lat: 1, lng: 2 })).toMatchObject({
      floor: 0,
      hasElevator: false,
      hasItemsThatDoNotFitElevator: false,
    });
  });

  it('clears elevator-only flags when elevator is disabled', () => {
    expect(normalizeLocationAccess({
      address: 'A', lat: 1, lng: 2, floor: 4, hasElevator: false, hasItemsThatDoNotFitElevator: true,
    })).toMatchObject({ hasElevator: false, hasItemsThatDoNotFitElevator: false });
  });

  it('formats detailed and route summaries', () => {
    const pickup = { address: 'A', lat: 1, lng: 2, floor: 3, hasElevator: true, hasItemsThatDoNotFitElevator: true };
    const dropoff = { address: 'B', lat: 3, lng: 4, floor: 0 };
    expect(formatLocationAccess(pickup)).toBe('Piso 3, con ascensor, hay objetos que no entran');
    expect(formatJobAccessSummary({ pickup, dropoff, extraStops: [] })).toBe('O: P3 asc. + objetos fuera | D: PB');
  });
});
