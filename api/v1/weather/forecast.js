// Open-Meteo forecast proxy with in-memory cache.
// No API key required for non-commercial use.
const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_ENTRIES = 20;

/** @type {Map<string, {data: object, ts: number}>} */
const cache = new Map();

const trimCache = () => {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  const entries = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
  for (const [key] of entries.slice(0, cache.size - MAX_CACHE_ENTRIES)) {
    cache.delete(key);
  }
};

/**
 * Map WMO weather codes to a simple label for UI display.
 * https://www.nodc.noaa.gov/archive/arc0021/0002199/1.1/data/0-data/HTML/WMO-CODE/WMO4677.HTM
 */
const weatherCodeLabel = (code) => {
  if (code == null || !Number.isFinite(code)) return 'unknown';
  if (code === 0) return 'clear';
  if (code <= 3) return 'partly-cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 55) return 'drizzle';
  if (code >= 61 && code <= 65) return 'rain';
  if (code >= 71 && code <= 77) return 'snow';
  if (code >= 80 && code <= 82) return 'rain-showers';
  if (code >= 85 && code <= 86) return 'snow-showers';
  if (code >= 95) return 'thunderstorm';
  return 'unknown';
};

const buildCacheKey = (lat, lng) => `${Number(lat).toFixed(3)},${Number(lng).toFixed(3)}`;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const latRaw = req.query.lat;
  const lngRaw = req.query.lng;

  if (latRaw == null || lngRaw == null) {
    res.status(400).json({ error: 'Missing lat/lng query params' });
    return;
  }

  const lat = Number(latRaw);
  const lng = Number(lngRaw);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    res.status(400).json({ error: 'Invalid lat/lng values' });
    return;
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: 'Coordinates out of range' });
    return;
  }

  const cacheKey = buildCacheKey(lat, lng);
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    res.status(200).json(cached.data);
    return;
  }

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: 'temperature_2m_min,temperature_2m_max,precipitation_probability_max,weather_code',
    timezone: 'America/Argentina/Buenos_Aires',
    forecast_days: '16',
  });

  try {
    const upstream = await fetch(`${OPEN_METEO_BASE}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      console.error(`[weather] Open-Meteo returned ${upstream.status}`);
      res.status(502).json({ error: 'Upstream weather service error' });
      return;
    }

    const raw = await upstream.json();

    // Sanitize: only return daily fields we care about
    const daily = raw.daily ?? {};
    const dates = daily.time ?? [];
    const tempMin = daily.temperature_2m_min ?? [];
    const tempMax = daily.temperature_2m_max ?? [];
    const precipProb = daily.precipitation_probability_max ?? [];
    const weatherCodes = daily.weather_code ?? [];

    const forecast = {
      latitude: lat,
      longitude: lng,
      timezone: 'America/Argentina/Buenos_Aires',
      daily: dates.map((date, i) => ({
        date,
        temperatureMin: tempMin[i] ?? null,
        temperatureMax: tempMax[i] ?? null,
        precipitationProbability: precipProb[i] ?? null,
        weatherCode: weatherCodes[i] ?? null,
        weatherLabel: weatherCodeLabel(weatherCodes[i]),
      })),
    };

    cache.set(cacheKey, { data: forecast, ts: Date.now() });
    trimCache();

    res.status(200).json(forecast);
  } catch (error) {
    console.error('[weather] Fetch error:', error.message);
    res.status(502).json({ error: 'Failed to fetch weather data' });
  }
}
