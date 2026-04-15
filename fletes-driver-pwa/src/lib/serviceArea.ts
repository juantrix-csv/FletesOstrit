import type { LocationData } from './types';

type ServiceAreaResponse = {
  minutes: number;
  source: 'mapbox' | 'approximate';
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
};

const serviceAreaCache = new Map<string, GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>>();

const buildServiceAreaUrl = (location: LocationData, minutes: number) => {
  const url = new URL('/api/service-area', window.location.origin);
  url.searchParams.set('lat', String(location.lat));
  url.searchParams.set('lng', String(location.lng));
  url.searchParams.set('minutes', String(minutes));
  return url.toString();
};

const buildServiceAreaKey = (location: LocationData, minutes: number) => (
  `${location.lat.toFixed(5)},${location.lng.toFixed(5)}:${minutes}`
);

const isServiceAreaGeometry = (geometry: unknown): geometry is GeoJSON.Polygon | GeoJSON.MultiPolygon => {
  if (!geometry || typeof geometry !== 'object') return false;
  const candidate = geometry as { type?: unknown; coordinates?: unknown };
  return (candidate.type === 'Polygon' || candidate.type === 'MultiPolygon')
    && Array.isArray(candidate.coordinates)
    && candidate.coordinates.length > 0;
};

export const getServiceArea = async (
  location: LocationData,
  minutes = 15,
): Promise<GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> | null> => {
  const key = buildServiceAreaKey(location, minutes);
  const cached = serviceAreaCache.get(key);
  if (cached) return cached;

  try {
    const res = await fetch(buildServiceAreaUrl(location, minutes));
    if (!res.ok) throw new Error('service-area');
    const data = await res.json() as ServiceAreaResponse;
    if (!isServiceAreaGeometry(data?.geometry)) return null;
    const feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> = {
      type: 'Feature',
      properties: {
        minutes: Number.isFinite(data.minutes) ? data.minutes : minutes,
        source: data.source ?? 'approximate',
      },
      geometry: data.geometry,
    };
    serviceAreaCache.set(key, feature);
    return feature;
  } catch {
    return null;
  }
};
