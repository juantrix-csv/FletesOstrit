import { useEffect, useState } from 'react';
import { MAP_STYLE, MAPBOX_ACCESS_TOKEN, hasMapboxAccessToken } from './mapStyle';

export type MapProvider = 'mapbox' | 'open';

export const OPEN_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

let activeMapProvider: MapProvider = hasMapboxAccessToken() ? 'mapbox' : 'open';
const subscribers = new Set<(provider: MapProvider) => void>();

const notifyProviderChange = () => {
  subscribers.forEach((listener) => listener(activeMapProvider));
};

const setActiveMapProvider = (provider: MapProvider) => {
  if (activeMapProvider === provider) return;
  activeMapProvider = provider;
  notifyProviderChange();
};

const getErrorStatus = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
    cause?: { status?: unknown };
  };
  const value = candidate.status ?? candidate.statusCode ?? candidate.response?.status ?? candidate.cause?.status;
  return Number.isFinite(value) ? Number(value) : null;
};

const getErrorMessage = (error: unknown): string => {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  if (typeof error === 'object') {
    const candidate = error as {
      message?: unknown;
      error?: unknown;
    };
    return [
      typeof candidate.message === 'string' ? candidate.message : '',
      typeof candidate.error === 'string' ? candidate.error : '',
      typeof candidate.error === 'object' && candidate.error && typeof (candidate.error as { message?: unknown }).message === 'string'
        ? String((candidate.error as { message?: unknown }).message)
        : '',
    ]
      .filter(Boolean)
      .join(' ');
  }
  return '';
};

const isMapboxRecoverableFailure = (error: unknown): boolean => {
  const status = getErrorStatus(error);
  if (status != null && [401, 402, 403, 429].includes(status)) {
    return true;
  }

  const message = getErrorMessage(error).toLowerCase();
  return [
    'access token',
    'rate limit',
    'quota',
    'forbidden',
    'unauthorized',
    'not authorized',
    'too many requests',
  ].some((pattern) => message.includes(pattern));
};

export const forceOpenMapProvider = () => {
  setActiveMapProvider('open');
};

export const useMapProviderFallback = () => {
  const [provider, setProvider] = useState<MapProvider>(() => activeMapProvider);

  useEffect(() => {
    subscribers.add(setProvider);
    return () => {
      subscribers.delete(setProvider);
    };
  }, []);

  return {
    provider,
    isUsingOpenProvider: provider === 'open',
    mapStyle: provider === 'open' ? OPEN_MAP_STYLE : MAP_STYLE,
    mapboxAccessToken: provider === 'open' ? undefined : MAPBOX_ACCESS_TOKEN,
    handleMapError: (event?: { error?: unknown } | null) => {
      if (activeMapProvider === 'open') return;
      if (isMapboxRecoverableFailure(event?.error)) {
        forceOpenMapProvider();
      }
    },
  };
};
