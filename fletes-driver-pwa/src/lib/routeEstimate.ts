import type { LocationData } from './types';

type RouteEstimate = {
  distanceMeters: number;
  durationSeconds: number;
};

const estimateCache = new Map<string, RouteEstimate>();

const buildRouteEstimateUrl = (origin: LocationData, destination: LocationData) => {
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coords}`);
  url.searchParams.set('overview', 'false');
  url.searchParams.set('alternatives', 'false');
  url.searchParams.set('steps', 'false');
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
    const route = data?.routes?.[0];
    if (!route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration)) {
      return null;
    }
    const estimate = {
      distanceMeters: Number(route.distance),
      durationSeconds: Number(route.duration),
    };
    estimateCache.set(key, estimate);
    return estimate;
  } catch {
    return null;
  }
};
