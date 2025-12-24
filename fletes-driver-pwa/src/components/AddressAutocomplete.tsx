import { useEffect, useState } from 'react';
import type { LocationData } from '../lib/types';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface AddressAutocompleteProps {
  label: string;
  placeholder?: string;
  onSelect: (location: LocationData | null) => void;
}

const BA_PROVINCE_BOUNDS = {
  minLon: -63.9,
  minLat: -40.8,
  maxLon: -56.0,
  maxLat: -33.0,
};

const buildSearchUrl = (query: string) => {
  const url = new URL('/api/geocode', window.location.origin);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '5');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'es');
  url.searchParams.set('countrycodes', 'ar');
  url.searchParams.set('bounded', '1');
  url.searchParams.set(
    'viewbox',
    `${BA_PROVINCE_BOUNDS.minLon},${BA_PROVINCE_BOUNDS.maxLat},${BA_PROVINCE_BOUNDS.maxLon},${BA_PROVINCE_BOUNDS.minLat}`
  );
  return url.toString();
};

export default function AddressAutocomplete({ label, placeholder, onSelect }: AddressAutocompleteProps) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<NominatimResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 4) {
      setOptions([]);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const id = window.setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(buildSearchUrl(trimmed), { signal: controller.signal });
        if (!res.ok) throw new Error('Search failed');
        const data = (await res.json()) as NominatimResult[];
        setOptions(data);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setOptions([]);
        }
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      clearTimeout(id);
      controller.abort();
    };
  }, [query]);

  const handleChange = (value: string) => {
    setQuery(value);
    setOpen(true);
    onSelect(null);
  };

  const handleSelect = (item: NominatimResult) => {
    const location: LocationData = {
      address: item.display_name,
      lat: Number(item.lat),
      lng: Number(item.lon),
    };
    setQuery(item.display_name);
    setOpen(false);
    onSelect(location);
  };

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium">{label}</label>
      <div className="relative">
        <input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border p-2"
          autoComplete="off"
        />
        {open && (loading || options.length > 0) && (
          <div className="absolute z-10 mt-1 w-full rounded border bg-white shadow">
            {loading && <div className="p-2 text-sm text-gray-500">Buscando...</div>}
            {!loading && options.map((item) => (
              <button
                key={item.place_id}
                type="button"
                onMouseDown={() => handleSelect(item)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
              >
                {item.display_name}
              </button>
            ))}
            {!loading && options.length === 0 && (
              <div className="p-2 text-sm text-gray-500">Sin resultados</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
