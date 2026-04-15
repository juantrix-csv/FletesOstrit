import {
  buildMapboxIsochroneUrl,
  hasMapboxAccessToken,
} from './_mapbox.js';

const EARTH_RADIUS_METERS = 6371008.8;
const APPROX_CITY_SPEED_KMH = 35;
const DEFAULT_MINUTES = 15;
const MAX_MINUTES = 60;

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
    try {
      const response = await fetch(buildMapboxIsochroneUrl({ lat, lng, minutes }));
      const data = await response.json().catch(() => null);
      const geometry = response.ok ? getFirstIsochroneGeometry(data) : null;
      if (geometry) {
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

  res.status(200).json({
    minutes,
    source: 'approximate',
    geometry: buildApproximateCircle({ lat, lng, minutes }),
  });
}
