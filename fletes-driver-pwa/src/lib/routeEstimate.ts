import type { LocationData } from './types';

type RouteEstimate = {
  distanceMeters: number;
  durationSeconds: number;
};

const estimateCache = new Map<string, RouteEstimate>();

const buildRouteEstimateUrl = (origin: LocationData, destination: LocationData) => {
  const url = new URL('/api/route', window.location.origin);
  url.searchParams.set('points', `${origin.lat},${origin.lng}|${destination.lat},${destination.lng}`);
  return url.toString();
};

const buildEstimateKey = (origin: LocationData, destination: LocationData) => (
  `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}:${destination.lat.toFixed(5)},${destination.lng.toFixed(5)}`
);

export const getRouteEstimate = async (origin: LocationData, destination: LocationData): Promise<RouteEstimate | null> => {
  const key = buildEstimateKey(origin, destination);
  const cached = estimateCache.get(key);
  if (cached) return cached;

  try {
    const res = await fetch(buildRouteEstimateUrl(origin, destination));
    if (!res.ok) throw new Error('route-estimate');
    const data = await res.json();
    if (!Number.isFinite(data?.distanceMeters) || !Number.isFinite(data?.durationSeconds)) {
      return null;
    }
    const estimate = {
      distanceMeters: Number(data.distanceMeters),
      durationSeconds: Number(data.durationSeconds),
    };
    estimateCache.set(key, estimate);
    return estimate;
  } catch {
    return null;
  }
};
