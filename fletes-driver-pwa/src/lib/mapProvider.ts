import { useTheme } from '../hooks/useTheme';
import { OPEN_MAP_STYLES } from './mapStyle';

export type MapProvider = 'open';

export const forceOpenMapProvider = () => {};

export const useMapProviderFallback = () => {
  const { theme } = useTheme();

  return {
    provider: 'open' as const,
    isUsingOpenProvider: true,
    mapStyle: OPEN_MAP_STYLES[theme],
    handleMapError: () => {},
  };
};
