import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { buildReverseUrl, reverseGeocodeLocation } from './geocode';

describe('buildReverseUrl', () => {
  it('builds the reverse geocode URL with coordinates', () => {
    const url = new URL(buildReverseUrl(-34.9, -57.95, 'http://localhost'));
    expect(url.pathname).toBe('/api/reverse-geocode');
    expect(url.searchParams.get('lat')).toBe('-34.9');
    expect(url.searchParams.get('lon')).toBe('-57.95');
    expect(url.searchParams.get('format')).toBe('jsonv2');
  });
});

describe('reverseGeocodeLocation', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  it('uses display_name when available', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ display_name: 'Test Address' }),
    });

    const result = await reverseGeocodeLocation(1, 2, 'Fallback', { origin: 'http://localhost' });
    expect(result).toEqual({ address: 'Test Address', lat: 1, lng: 2 });
  });

  it('falls back when display_name is missing', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    const result = await reverseGeocodeLocation(1, 2, 'Fallback', { origin: 'http://localhost' });
    expect(result).toEqual({ address: 'Fallback', lat: 1, lng: 2 });
  });

  it('falls back on request errors', async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue(new Error('fail'));

    const result = await reverseGeocodeLocation(1, 2, 'Fallback', { origin: 'http://localhost' });
    expect(result).toEqual({ address: 'Fallback', lat: 1, lng: 2 });
  });
});
