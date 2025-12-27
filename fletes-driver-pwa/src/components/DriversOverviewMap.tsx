import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Marker, type MapRef } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import type { Driver, DriverLocation } from '../lib/types';
import { cn } from '../lib/utils';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const BA_BOUNDS = { minLon: -63.9, minLat: -40.8, maxLon: -56.0, maxLat: -33.0 };
const fallbackCenter = { lat: -34.9214, lng: -57.9544 };

interface DriversOverviewMapProps {
  locations: DriverLocation[];
  drivers: Driver[];
  className?: string;
}

export default function DriversOverviewMap({ locations, drivers, className }: DriversOverviewMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const driversById = useMemo(() => {
    const map = new Map<string, Driver>();
    drivers.forEach((driver) => map.set(driver.id, driver));
    return map;
  }, [drivers]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (locations.length === 0) {
      mapRef.current.easeTo({ center: [fallbackCenter.lng, fallbackCenter.lat], zoom: 10, duration: 400 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds(
      [locations[0].lng, locations[0].lat],
      [locations[0].lng, locations[0].lat]
    );
    locations.slice(1).forEach((loc) => bounds.extend([loc.lng, loc.lat]));
    mapRef.current.fitBounds(bounds, { padding: 80, duration: 500 });
  }, [mapReady, locations]);

  return (
    <div className={cn("h-[280px] w-full overflow-hidden rounded-xl border bg-white", className)}>
      <Map
        ref={mapRef}
        initialViewState={{ latitude: fallbackCenter.lat, longitude: fallbackCenter.lng, zoom: 10 }}
        mapStyle={MAP_STYLE}
        onLoad={() => setMapReady(true)}
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
        {locations.map((loc) => {
          const driver = driversById.get(loc.driverId);
          const label = driver ? driver.name : 'Conductor';
          return (
            <Marker key={loc.driverId} latitude={loc.lat} longitude={loc.lng}>
              <div className="flex flex-col items-center">
                <div className={cn("h-3 w-3 rounded-full shadow", driver?.active ? "bg-emerald-500" : "bg-gray-400")} />
                <span className="mt-1 rounded bg-white px-1.5 py-0.5 text-[10px] text-gray-700 shadow">
                  {label}
                </span>
              </div>
            </Marker>
          );
        })}
      </Map>
    </div>
  );
}
