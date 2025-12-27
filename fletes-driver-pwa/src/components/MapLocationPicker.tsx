import { useEffect, useMemo, useState } from 'react';
import Map, { Marker, type MapLayerMouseEvent } from 'react-map-gl/maplibre';
import type { LocationData } from '../lib/types';
import { cn } from '../lib/utils';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const BA_BOUNDS = { minLon: -63.9, minLat: -40.8, maxLon: -56.0, maxLat: -33.0 };
const fallbackLocation: LocationData = { address: 'La Plata', lat: -34.9214, lng: -57.9544 };

const formatMapAddress = (lat: number, lng: number) =>
  `Punto en mapa (${lat.toFixed(5)}, ${lng.toFixed(5)})`;

const isWithinBounds = (lat: number, lng: number) =>
  lat >= BA_BOUNDS.minLat &&
  lat <= BA_BOUNDS.maxLat &&
  lng >= BA_BOUNDS.minLon &&
  lng <= BA_BOUNDS.maxLon;

interface MapLocationPickerProps {
  pickup: LocationData | null;
  dropoff: LocationData | null;
  active: 'pickup' | 'dropoff';
  onSelect: (kind: 'pickup' | 'dropoff', location: LocationData) => void;
  className?: string;
}

export default function MapLocationPicker({ pickup, dropoff, active, onSelect, className }: MapLocationPickerProps) {
  const activeLocation = active === 'pickup' ? pickup : dropoff;
  const center = useMemo(
    () => activeLocation ?? pickup ?? dropoff ?? fallbackLocation,
    [activeLocation, pickup, dropoff]
  );
  const [viewState, setViewState] = useState(() => ({
    latitude: center.lat,
    longitude: center.lng,
    zoom: 11.5,
  }));

  useEffect(() => {
    setViewState((prev) => ({
      ...prev,
      latitude: center.lat,
      longitude: center.lng,
    }));
  }, [center.lat, center.lng]);

  const handleClick = (event: MapLayerMouseEvent) => {
    const { lng, lat } = event.lngLat;
    if (!isWithinBounds(lat, lng)) return;
    onSelect(active, {
      address: formatMapAddress(lat, lng),
      lat,
      lng,
    });
  };

  return (
    <div className={cn("h-[240px] w-full overflow-hidden rounded border bg-white", className)}>
      <Map
        viewState={viewState}
        onMove={(evt) => setViewState(evt.viewState)}
        mapStyle={MAP_STYLE}
        onClick={handleClick}
        maxBounds={[
          [BA_BOUNDS.minLon, BA_BOUNDS.minLat],
          [BA_BOUNDS.maxLon, BA_BOUNDS.maxLat],
        ]}
        reuseMaps
        attributionControl={false}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        style={{ width: '100%', height: '100%' }}
      >
        {pickup && (
          <Marker latitude={pickup.lat} longitude={pickup.lng}>
            <div className={cn("h-3 w-3 rounded-full bg-green-600 shadow", active === 'pickup' ? "ring-2 ring-green-200" : "ring-2 ring-white")} />
          </Marker>
        )}
        {dropoff && (
          <Marker latitude={dropoff.lat} longitude={dropoff.lng}>
            <div className={cn("h-3 w-3 rounded-full bg-red-600 shadow", active === 'dropoff' ? "ring-2 ring-red-200" : "ring-2 ring-white")} />
          </Marker>
        )}
      </Map>
    </div>
  );
}
