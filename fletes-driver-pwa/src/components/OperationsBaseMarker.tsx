import { Home } from 'lucide-react';
import { Marker } from 'react-map-gl/maplibre';
import type { LocationData } from '../lib/types';

interface OperationsBaseMarkerProps {
  location: LocationData | null;
}

export default function OperationsBaseMarker({ location }: OperationsBaseMarkerProps) {
  if (!location) return null;

  return (
    <Marker latitude={location.lat} longitude={location.lng} anchor="bottom">
      <div className="pointer-events-none flex flex-col items-center">
        <span className="mb-1 rounded-full border border-sky-200 bg-white/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700 shadow">
          Base
        </span>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-sky-600 text-white shadow-lg">
          <Home size={16} />
        </div>
      </div>
    </Marker>
  );
}
