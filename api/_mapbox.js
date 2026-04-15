const MAPBOX_GEOCODE_ENDPOINT = 'https://api.mapbox.com/search/geocode/v6/forward';
const MAPBOX_REVERSE_GEOCODE_ENDPOINT = 'https://api.mapbox.com/search/geocode/v6/reverse';
const MAPBOX_DIRECTIONS_ENDPOINT = 'https://api.mapbox.com/directions/v5/mapbox/driving';
const MAPBOX_ISOCHRONE_ENDPOINT = 'https://api.mapbox.com/isochrone/v1/mapbox/driving';

const BA_BOUNDS = {
  south: -40.8,
  west: -63.9,
  north: -33.0,
  east: -56.0,
};

const getAccessToken = () => process.env.MAPBOX_ACCESS_TOKEN ?? process.env.VITE_MAPBOX_ACCESS_TOKEN ?? '';

const isMapboxEnabled = () => ['1', 'true', 'yes', 'on'].includes(
  (process.env.MAPBOX_ENABLED ?? '').trim().toLowerCase()
);

export const hasMapboxAccessToken = () => isMapboxEnabled() && getAccessToken().trim().length > 0;

const createMapboxUrl = (baseUrl) => {
  const url = new URL(baseUrl);
  url.searchParams.set('access_token', getAccessToken());
  url.searchParams.set('language', 'es');
  url.searchParams.set('country', 'ar');
  return url;
};

const parseViewboxToMapboxBbox = (viewbox) => {
  if (typeof viewbox !== 'string') return null;
  const parts = viewbox.split(',').map((value) => Number(value));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return null;
  const [minLon, maxLat, maxLon, minLat] = parts;
  return `${minLon},${minLat},${maxLon},${maxLat}`;
};

export const buildMapboxGeocodeUrl = (query, params = {}) => {
  const url = createMapboxUrl(MAPBOX_GEOCODE_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('limit', params.limit || '5');
  url.searchParams.set('proximity', '-57.9544,-34.9214');
  url.searchParams.set('bbox', parseViewboxToMapboxBbox(params.viewbox) ?? `${BA_BOUNDS.west},${BA_BOUNDS.south},${BA_BOUNDS.east},${BA_BOUNDS.north}`);
  return url.toString();
};

export const buildMapboxReverseGeocodeUrl = (lat, lon) => {
  const url = createMapboxUrl(MAPBOX_REVERSE_GEOCODE_ENDPOINT);
  url.searchParams.set('longitude', lon);
  url.searchParams.set('latitude', lat);
  url.searchParams.set('limit', '1');
  return url.toString();
};

export const buildMapboxDirectionsUrl = (points) => {
  const coords = points.map((point) => `${point.lng},${point.lat}`).join(';');
  const url = createMapboxUrl(`${MAPBOX_DIRECTIONS_ENDPOINT}/${coords}`);
  url.searchParams.delete('country');
  url.searchParams.delete('language');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('steps', 'false');
  return url.toString();
};

export const buildMapboxIsochroneUrl = ({ lat, lng, minutes }) => {
  const url = createMapboxUrl(`${MAPBOX_ISOCHRONE_ENDPOINT}/${lng},${lat}`);
  url.searchParams.delete('country');
  url.searchParams.delete('language');
  url.searchParams.set('contours_minutes', String(minutes));
  url.searchParams.set('polygons', 'true');
  url.searchParams.set('denoise', '1');
  url.searchParams.set('generalize', '60');
  return url.toString();
};

export const normalizeMapboxGeocodeResults = (data) => {
  if (!Array.isArray(data?.features)) return [];
  return data.features.map((feature, index) => ({
    place_id: feature.properties?.mapbox_id ?? feature.id ?? `${feature.properties?.full_address ?? 'result'}-${index}`,
    display_name: feature.properties?.full_address
      ?? feature.properties?.place_formatted
      ?? feature.properties?.name
      ?? '',
    lat: String(feature.geometry?.coordinates?.[1] ?? ''),
    lon: String(feature.geometry?.coordinates?.[0] ?? ''),
  }));
};

export const normalizeMapboxReverseGeocodeResult = (data) => {
  const first = Array.isArray(data?.features) ? data.features[0] : null;
  return {
    display_name: first?.properties?.full_address
      ?? first?.properties?.place_formatted
      ?? first?.properties?.name
      ?? null,
  };
};

export const normalizeMapboxDirectionsResult = (data) => {
  const route = Array.isArray(data?.routes) ? data.routes[0] : null;
  if (!route) {
    return {
      geometry: null,
      distanceMeters: null,
      durationSeconds: null,
    };
  }

  return {
    geometry: route.geometry ?? null,
    distanceMeters: Number.isFinite(route.distance) ? Number(route.distance) : null,
    durationSeconds: Number.isFinite(route.duration) ? Number(route.duration) : null,
  };
};
