import { getCachedQueryEntry, setCachedQueryData } from './queryCache';

const WEATHER_STALE_MS = 30 * 60 * 1000; // 30 minutes

export type WeatherDaily = {
  date: string;
  temperatureMin: number | null;
  temperatureMax: number | null;
  precipitationProbability: number | null;
  weatherCode: number | null;
  weatherLabel: string;
};

export type WeatherForecast = {
  latitude: number;
  longitude: number;
  timezone: string;
  daily: WeatherDaily[];
};

const WEATHER_CACHE_PREFIX = 'weather:forecast:';

export const weatherForecastQueryKey = (lat: number, lng: number) =>
  `${WEATHER_CACHE_PREFIX}${lat.toFixed(3)},${lng.toFixed(3)}`;

export const getCachedWeather = (lat: number, lng: number): WeatherForecast | null => {
  const entry = getCachedQueryEntry<WeatherForecast>(weatherForecastQueryKey(lat, lng));
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > WEATHER_STALE_MS) return null;
  return entry.data;
};

export const fetchWeatherForecast = async (
  lat: number,
  lng: number,
): Promise<WeatherForecast> => {
  const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';
  const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
  const res = await fetch(`${API_BASE}/weather/forecast?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Weather API error: ${res.status}`);
  }
  const data: WeatherForecast = await res.json();
  // Cache in queryCache for deduplication
  const key = weatherForecastQueryKey(lat, lng);
  setCachedQueryData(key, data);
  return data;
};

/**
 * Returns a forecast for a specific date string (YYYY-MM-DD), or null.
 */
export const getForecastForDate = (
  forecast: WeatherForecast | null,
  dateKey: string,
): WeatherDaily | null => {
  if (!forecast) return null;
  return forecast.daily.find((d) => d.date === dateKey) ?? null;
};

/** Map weather labels to Unicode emoji for inline display. */
const WEATHER_EMOJI: Record<string, string> = {
  'clear': '\u2600\uFE0F',       // ☀️
  'partly-cloudy': '\u26C5',      // ⛅
  'fog': '\uD83C\uDF2B\uFE0F',   // 🌫️
  'drizzle': '\uD83C\uDF26\uFE0F', // 🌦️
  'rain': '\uD83C\uDF27\uFE0F',  // 🌧️
  'rain-showers': '\uD83C\uDF27\uFE0F', // 🌧️
  'snow': '\u2744\uFE0F',        // ❄️
  'snow-showers': '\u2744\uFE0F', // ❄️
  'thunderstorm': '\u26C8\uFE0F', // ⛈️
  'unknown': '\u2753',            // ❓
};

export const getWeatherEmoji = (label: string): string =>
  WEATHER_EMOJI[label] ?? WEATHER_EMOJI['unknown'];

/**
 * Format a compact weather summary string for calendar day cells.
 * Returns null if no valid weather data.
 */
export const formatWeatherSummary = (daily: WeatherDaily | null): string | null => {
  if (!daily) return null;
  const parts: string[] = [getWeatherEmoji(daily.weatherLabel)];

  if (daily.temperatureMin != null && daily.temperatureMax != null) {
    parts.push(`${Math.round(daily.temperatureMin)}\u00B0/${Math.round(daily.temperatureMax)}\u00B0`);
  }

  if (daily.precipitationProbability != null && daily.precipitationProbability > 0) {
    parts.push(`${Math.round(daily.precipitationProbability)}%`);
  }

  return parts.length > 1 ? parts.join(' ') : null;
};
