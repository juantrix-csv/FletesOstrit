import type { Job, LocationData } from './types';

export const normalizeLocationAccess = (location: LocationData, defaultFloor: number | null = 0): LocationData => {
  const floor = Number.isInteger(location.floor) && (location.floor as number) >= 0 && (location.floor as number) <= 99
    ? location.floor as number
    : defaultFloor;
  const hasElevator = floor != null && floor > 0 && location.hasElevator === true;
  return {
    ...location,
    floor,
    hasElevator,
    hasItemsThatDoNotFitElevator: hasElevator && location.hasItemsThatDoNotFitElevator === true,
  };
};

export const formatLocationAccess = (location?: LocationData | null) => {
  if (!location) return 'Acceso sin informar';
  if (!Number.isInteger(location.floor)) return 'Acceso sin informar';
  const normalized = normalizeLocationAccess(location, null);
  if (normalized.floor === 0) return 'Planta baja';
  const elevator = normalized.hasElevator ? 'con ascensor' : 'sin ascensor';
  const oversized = normalized.hasItemsThatDoNotFitElevator ? ', hay objetos que no entran' : '';
  return `Piso ${normalized.floor}, ${elevator}${oversized}`;
};

export const formatLocationAccessCompact = (location?: LocationData | null) => {
  if (!location) return 'N/D';
  if (!Number.isInteger(location.floor)) return 'N/D';
  const normalized = normalizeLocationAccess(location, null);
  if (normalized.floor === 0) return 'PB';
  const elevator = normalized.hasElevator ? 'asc.' : 'sin asc.';
  const oversized = normalized.hasItemsThatDoNotFitElevator ? ' + objetos fuera' : '';
  return `P${normalized.floor} ${elevator}${oversized}`;
};

export const formatJobAccessSummary = (job: Pick<Job, 'pickup' | 'dropoff' | 'extraStops'>) => {
  const parts = [
    `O: ${formatLocationAccessCompact(job.pickup)}`,
    ...(job.extraStops ?? []).map((stop, index) => `P${index + 1}: ${formatLocationAccessCompact(stop)}`),
    `D: ${formatLocationAccessCompact(job.dropoff)}`,
  ];
  return parts.join(' | ');
};
