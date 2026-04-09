const NOMINATIM_SEARCH_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';
const OSRM_ROUTE_ENDPOINT = 'https://router.project-osrm.org/route/v1/driving';

const BA_BOUNDS = {
  south: -40.8,
  west: -63.9,
  north: -33.0,
  east: -56.0,
};

const getNominatimEmail = () => (process.env.NOMINATIM_EMAIL ?? '').trim();

const getNominatimUserAgent = () => (
  process.env.NOMINATIM_USER_AGENT?.trim()
  || 'FletesOstrit/1.0 (OpenStreetMap fallback)'
);

const createOpenMapsUrl = (baseUrl) => new URL(baseUrl);

const parseViewboxToNominatimBbox = (viewbox) => {
  if (typeof viewbox !== 'string') return null;
  const parts = viewbox.split(',').map((value) => Number(value));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) return null;
  return viewbox;
};

export const getOpenMapsRequestOptions = () => ({
  headers: {
    'Accept-Language': 'es',
    'User-Agent': getNominatimUserAgent(),
  },
});

export const buildOpenMapsGeocodeUrl = (query, params = {}) => {
  const url = createOpenMapsUrl(NOMINATIM_SEARCH_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', params.limit || '5');
  url.searchParams.set('addressdetails', params.addressdetails || '1');
  url.searchParams.set('accept-language', params['accept-language'] || 'es');
  url.searchParams.set('countrycodes', params.countrycodes || 'ar');
  url.searchParams.set('bounded', params.bounded || '1');
  url.searchParams.set(
    'viewbox',
    parseViewboxToNominatimBbox(params.viewbox)
      ?? `${BA_BOUNDS.west},${BA_BOUNDS.north},${BA_BOUNDS.east},${BA_BOUNDS.south}`
  );

  const email = getNominatimEmail();
  if (email) url.searchParams.set('email', email);

  return url.toString();
};

export const buildOpenMapsReverseGeocodeUrl = (lat, lon) => {
  const url = createOpenMapsUrl(NOMINATIM_REVERSE_ENDPOINT);
  url.searchParams.set('lat', lat);
  url.searchParams.set('lon', lon);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');

  const email = getNominatimEmail();
  if (email) url.searchParams.set('email', email);

  return url.toString();
};

export const buildOpenMapsDirectionsUrl = (points) => {
  const coords = points.map((point) => `${point.lng},${point.lat}`).join(';');
  const url = createOpenMapsUrl(`${OSRM_ROUTE_ENDPOINT}/${coords}`);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('steps', 'false');
  return url.toString();
};

export const normalizeOpenMapsGeocodeResults = (data) => {
  if (!Array.isArray(data)) return [];
  return data.map((item, index) => ({
    place_id: item.place_id ?? `${item.display_name ?? 'result'}-${index}`,
    display_name: item.display_name ?? item.name ?? '',
    lat: String(item.lat ?? ''),
    lon: String(item.lon ?? ''),
  }));
};

export const normalizeOpenMapsReverseGeocodeResult = (data) => ({
  display_name: typeof data?.display_name === 'string' ? data.display_name : null,
});

export const normalizeOpenMapsDirectionsResult = (data) => {
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
