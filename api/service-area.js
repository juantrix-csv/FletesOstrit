import {
  buildMapboxIsochroneUrl,
  hasMapboxAccessToken,
} from './_mapbox.js';
import {
  buildOpenMapsTableUrl,
  getOpenMapsRequestOptions,
} from './_openmaps.js';

const EARTH_RADIUS_METERS = 6371008.8;
const APPROX_CITY_SPEED_KMH = 35;
const DEFAULT_MINUTES = 15;
const MAX_MINUTES = 60;
const ROUTED_AREA_VERSION = 1;
const ROUTED_AREA_BEARINGS = 24;
const ROUTED_AREA_RINGS = 4;
const ROUTED_AREA_MAX_SPEED_KMH = 80;

const toRadians = (value) => (value * Math.PI) / 180;
const toDegrees = (value) => (value * 180) / Math.PI;

const parseCoordinate = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseMinutes = (value) => {
  if (value == null || value === '') return DEFAULT_MINUTES;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(1, Math.min(MAX_MINUTES, Math.ceil(parsed)));
};

const isValidGeometry = (geometry) => (
  geometry
  && (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon')
  && Array.isArray(geometry.coordinates)
  && geometry.coordinates.length > 0
);

const getFirstIsochroneGeometry = (data) => {
  const features = Array.isArray(data?.features) ? data.features : [];
  const feature = features.find((item) => isValidGeometry(item?.geometry));
  return feature?.geometry ?? null;
};

const roundCoordinate = (value) => Number(value.toFixed(6));

const buildCacheKey = ({ lat, lng, minutes, source }) => (
  `${source}:v${ROUTED_AREA_VERSION}:${roundCoordinate(lat)},${roundCoordinate(lng)}:${minutes}`
);

const isCachedServiceArea = (value, key) => (
  value
  && value.key === key
  && Number.isFinite(value.minutes)
  && typeof value.source === 'string'
  && isValidGeometry(value.geometry)
);

const loadSettingsStore = async () => {
  try {
    return await import('./_db.js');
  } catch {
    return null;
  }
};

const getCachedServiceArea = async (key) => {
  try {
    const store = await loadSettingsStore();
    if (!store) return null;
    const stored = await store.getSetting('operationsBaseServiceAreas');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return null;
    const value = stored[key];
    return isCachedServiceArea(value, key) ? value : null;
  } catch {
    return null;
  }
};

const setCachedServiceArea = async (key, area) => {
  try {
    const store = await loadSettingsStore();
    if (!store) return;
    const stored = await store.getSetting('operationsBaseServiceAreas');
    const next = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    await store.setSetting('operationsBaseServiceAreas', {
      ...next,
      [key]: {
        ...area,
        key,
        createdAt: new Date().toISOString(),
      },
    });
  } catch {
    // The service area can still be returned even if persistence is unavailable.
  }
};

const destinationPoint = ({ lat, lng }, bearing, distanceMeters) => {
  const latRad = toRadians(lat);
  const lngRad = toRadians(lng);
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const pointLat = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance)
    + Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const pointLng = lngRad + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
    Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(pointLat)
  );
  return {
    lat: toDegrees(pointLat),
    lng: toDegrees(pointLng),
  };
};

const interpolatePoint = (from, to, ratio) => ({
  lat: from.lat + (to.lat - from.lat) * ratio,
  lng: from.lng + (to.lng - from.lng) * ratio,
});

const buildRoutedServiceArea = async ({ lat, lng, minutes }) => {
  const origin = { lat, lng };
  const maxDistanceMeters = (ROUTED_AREA_MAX_SPEED_KMH * 1000 / 60) * minutes;
  const samples = [];

  for (let bearingIndex = 0; bearingIndex < ROUTED_AREA_BEARINGS; bearingIndex += 1) {
    const bearing = (2 * Math.PI * bearingIndex) / ROUTED_AREA_BEARINGS;
    for (let ringIndex = 1; ringIndex <= ROUTED_AREA_RINGS; ringIndex += 1) {
      samples.push({
        bearingIndex,
        ringIndex,
        point: destinationPoint(origin, bearing, maxDistanceMeters * ringIndex / ROUTED_AREA_RINGS),
      });
    }
  }

  const response = await fetch(
    buildOpenMapsTableUrl([origin, ...samples.map((sample) => sample.point)]),
    getOpenMapsRequestOptions()
  );
  if (!response.ok) return null;

  const data = await response.json().catch(() => null);
  const durations = Array.isArray(data?.durations?.[0]) ? data.durations[0] : [];
  if (durations.length !== samples.length) return null;

  const targetSeconds = minutes * 60;
  const ringByBearing = new Map();
  samples.forEach((sample, index) => {
    const durationSeconds = Number(durations[index]);
    if (!Number.isFinite(durationSeconds)) return;
    const entries = ringByBearing.get(sample.bearingIndex) ?? [];
    entries.push({ ...sample, durationSeconds });
    ringByBearing.set(sample.bearingIndex, entries);
  });

  const ring = [];
  for (let bearingIndex = 0; bearingIndex < ROUTED_AREA_BEARINGS; bearingIndex += 1) {
    const entries = (ringByBearing.get(bearingIndex) ?? []).sort((a, b) => a.ringIndex - b.ringIndex);
    if (entries.length === 0) continue;

    let selected = origin;
    let previous = { point: origin, durationSeconds: 0 };
    for (const entry of entries) {
      if (entry.durationSeconds <= targetSeconds) {
        selected = entry.point;
        previous = entry;
        continue;
      }

      const span = entry.durationSeconds - previous.durationSeconds;
      const ratio = span > 0 ? Math.max(0, Math.min(1, (targetSeconds - previous.durationSeconds) / span)) : 0;
      selected = interpolatePoint(previous.point, entry.point, ratio);
      break;
    }
    ring.push([roundCoordinate(selected.lng), roundCoordinate(selected.lat)]);
  }

  if (ring.length < 3) return null;
  ring.push(ring[0]);
  return {
    type: 'Polygon',
    coordinates: [ring],
  };
};

const buildApproximateCircle = ({ lat, lng, minutes }) => {
  const radiusMeters = (APPROX_CITY_SPEED_KMH * 1000 / 60) * minutes;
  const latRad = toRadians(lat);
  const lngRad = toRadians(lng);
  const angularDistance = radiusMeters / EARTH_RADIUS_METERS;
  const steps = 96;
  const ring = [];

  for (let index = 0; index <= steps; index += 1) {
    const bearing = (2 * Math.PI * index) / steps;
    const pointLat = Math.asin(
      Math.sin(latRad) * Math.cos(angularDistance)
      + Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
    );
    const pointLng = lngRad + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(pointLat)
    );
    ring.push([toDegrees(pointLng), toDegrees(pointLat)]);
  }

  return {
    type: 'Polygon',
    coordinates: [ring],
  };
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const lat = parseCoordinate(req.query?.lat);
  const lng = parseCoordinate(req.query?.lng);
  const minutes = parseMinutes(req.query?.minutes);
  if (lat == null || lng == null) {
    res.status(400).json({ error: 'Missing coordinates' });
    return;
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180 || minutes == null) {
    res.status(400).json({ error: 'Invalid service area request' });
    return;
  }

  if (hasMapboxAccessToken()) {
    const key = buildCacheKey({ lat, lng, minutes, source: 'mapbox' });
    const cached = await getCachedServiceArea(key);
    if (cached) {
      res.status(200).json({
        minutes: cached.minutes,
        source: cached.source,
        geometry: cached.geometry,
        cached: true,
      });
      return;
    }

    try {
      const response = await fetch(buildMapboxIsochroneUrl({ lat, lng, minutes }));
      const data = await response.json().catch(() => null);
      const geometry = response.ok ? getFirstIsochroneGeometry(data) : null;
      if (geometry) {
        await setCachedServiceArea(key, {
          minutes,
          source: 'mapbox',
          geometry,
        });
        res.status(200).json({
          minutes,
          source: 'mapbox',
          geometry,
        });
        return;
      }
    } catch {
      // Use an approximate local area if Mapbox is unavailable.
    }
  }

  const routedKey = buildCacheKey({ lat, lng, minutes, source: 'openmaps-routed' });
  const cached = await getCachedServiceArea(routedKey);
  if (cached) {
    res.status(200).json({
      minutes: cached.minutes,
      source: cached.source,
      geometry: cached.geometry,
      cached: true,
    });
    return;
  }

  try {
    const geometry = await buildRoutedServiceArea({ lat, lng, minutes });
    if (geometry) {
      await setCachedServiceArea(routedKey, {
        minutes,
        source: 'openmaps-routed',
        geometry,
      });
      res.status(200).json({
        minutes,
        source: 'openmaps-routed',
        geometry,
        cached: false,
      });
      return;
    }
  } catch {
    // Fall back to the fixed-speed visual reference below.
  }

  res.status(200).json({
    minutes,
    source: 'approximate',
    geometry: buildApproximateCircle({ lat, lng, minutes }),
  });
}
