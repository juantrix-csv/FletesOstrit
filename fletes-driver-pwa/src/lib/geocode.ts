import type { LocationData } from './types';

interface ReverseGeocodeOptions {
  origin?: string;
}

const getDefaultOrigin = () => {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'http://localhost';
};

export const buildReverseUrl = (lat: number, lng: number, origin?: string) => {
  const url = new URL('/api/reverse-geocode', origin ?? getDefaultOrigin());
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'es');
  return url.toString();
};

export const reverseGeocodeLocation = async (
  lat: number,
  lng: number,
  fallbackAddress: string,
  options?: ReverseGeocodeOptions
): Promise<LocationData> => {
  try {
    const res = await fetch(buildReverseUrl(lat, lng, options?.origin));
    if (!res.ok) throw new Error('reverse');
    const data = await res.json();
    const address = typeof data?.display_name === 'string' ? data.display_name : fallbackAddress;
    return { address, lat, lng };
  } catch {
    return { address: fallbackAddress, lat, lng };
  }
};
