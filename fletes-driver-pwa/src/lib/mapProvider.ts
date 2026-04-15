import { OPEN_MAP_STYLE } from './mapStyle';

export type MapProvider = 'open';

export const forceOpenMapProvider = () => {};

export const useMapProviderFallback = () => ({
  provider: 'open' as const,
  isUsingOpenProvider: true,
  mapStyle: OPEN_MAP_STYLE,
  handleMapError: () => {},
});
