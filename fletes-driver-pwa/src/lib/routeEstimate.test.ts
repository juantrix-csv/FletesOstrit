import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearRouteEstimateCacheForTests, getRouteEstimate } from './routeEstimate';
import type { LocationData } from './types';

const origin: LocationData = { address: 'Origen', lat: -34.921, lng: -57.954 };
const destination: LocationData = { address: 'Destino', lat: -34.93, lng: -57.96 };

describe('getRouteEstimate', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearRouteEstimateCacheForTests();
    vi.stubGlobal('window', { location: { origin: 'http://localhost' } });
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    clearRouteEstimateCacheForTests();
  });

  it('returns distance and duration from the route API', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ distanceMeters: 1520.4, durationSeconds: 410.2 }),
    });

    await expect(getRouteEstimate(origin, destination)).resolves.toEqual({
      distanceMeters: 1520.4,
      durationSeconds: 410.2,
    });
    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.pathname).toBe('/api/route');
    expect(requestedUrl.searchParams.get('points')).toBe('-34.921,-57.954|-34.93,-57.96');
  });

  it('caches successful estimates for the same rounded route', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ distanceMeters: 2000, durationSeconds: 500 }),
    });

    const first = await getRouteEstimate(origin, destination);
    const second = await getRouteEstimate(
      { ...origin, lat: -34.921004 },
      { ...destination, lng: -57.960004 },
    );

    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null and does not cache failed or malformed responses', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ distanceMeters: null, durationSeconds: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ distanceMeters: 3000, durationSeconds: 900 }) });

    await expect(getRouteEstimate(origin, destination)).resolves.toBeNull();
    await expect(getRouteEstimate(origin, destination)).resolves.toBeNull();
    await expect(getRouteEstimate(origin, destination)).resolves.toEqual({
      distanceMeters: 3000,
      durationSeconds: 900,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
