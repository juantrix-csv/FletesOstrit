import { useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Marker, type MapRef } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import OperationsBaseMarker from './OperationsBaseMarker';
import { useOperationsBaseLocation } from '../hooks/useOperationsBaseLocation';
import type { Driver, DriverLocation } from '../lib/types';
import { MAP_STYLE, applyMapPalette } from '../lib/mapStyle';
import { cn } from '../lib/utils';
import { getDriverColors } from '../lib/driverColors';

const BA_BOUNDS = { minLon: -63.9, minLat: -40.8, maxLon: -56.0, maxLat: -33.0 };
const fallbackCenter = { lat: -34.9214, lng: -57.9544 };
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' } as const;
const MAX_BOUNDS: [[number, number], [number, number]] = [
  [BA_BOUNDS.minLon, BA_BOUNDS.minLat],
  [BA_BOUNDS.maxLon, BA_BOUNDS.maxLat],
];

interface DriversOverviewMapProps {
  locations: DriverLocation[];
  drivers: Driver[];
  className?: string;
}

export default function DriversOverviewMap({ locations, drivers, className }: DriversOverviewMapProps) {
  const { location: operationsBaseLocation } = useOperationsBaseLocation();
  const mapRef = useRef<MapRef | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const hasFitRef = useRef(false);
  const lastViewportKeyRef = useRef('');

  const driversById = useMemo(() => {
    const map = new Map<string, Driver>();
    drivers.forEach((driver) => map.set(driver.id, driver));
    return map;
  }, [drivers]);
  const initialViewState = useMemo(
    () => ({ latitude: fallbackCenter.lat, longitude: fallbackCenter.lng, zoom: 10 }),
    []
  );

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const points: Array<[number, number]> = locations.map((loc) => [loc.lng, loc.lat]);
    if (operationsBaseLocation) {
      points.push([operationsBaseLocation.lng, operationsBaseLocation.lat]);
    }
    if (points.length === 0) {
      if (!hasFitRef.current) {
        mapRef.current.easeTo({ center: [fallbackCenter.lng, fallbackCenter.lat], zoom: 10, duration: 400 });
      }
      return;
    }
    const viewportKey = points.map(([lng, lat]) => `${lat.toFixed(4)},${lng.toFixed(4)}`).join('|');
    if (hasFitRef.current && lastViewportKeyRef.current === viewportKey) return;
    if (points.length === 1) {
      mapRef.current.easeTo({ center: points[0], zoom: 10.5, duration: 400 });
      hasFitRef.current = true;
      lastViewportKeyRef.current = viewportKey;
      return;
    }
    const bounds = new maplibregl.LngLatBounds(
      points[0],
      points[0]
    );
    points.slice(1).forEach((point) => bounds.extend(point));
    mapRef.current.fitBounds(bounds, { padding: 80, duration: 500 });
    hasFitRef.current = true;
    lastViewportKeyRef.current = viewportKey;
  }, [locations, mapReady, operationsBaseLocation]);

  return (
    <div className={cn("aspect-[2/1] w-full min-h-[240px] overflow-hidden rounded-xl border bg-white", className)}>
      <MapGL
        ref={mapRef}
        initialViewState={initialViewState}
        mapStyle={MAP_STYLE}
        onLoad={() => {
          setMapReady(true);
          const map = mapRef.current?.getMap();
          if (map) applyMapPalette(map);
        }}
        maxBounds={MAX_BOUNDS}
        reuseMaps
        attributionControl={false}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
        style={MAP_CONTAINER_STYLE}
      >
        {locations.map((loc) => {
          const driver = driversById.get(loc.driverId);
          const label = driver ? driver.name : 'Conductor';
          const driverColors = getDriverColors(loc.driverId);
          const isActive = driver?.active ?? false;
          return (
            <Marker key={loc.driverId} latitude={loc.lat} longitude={loc.lng}>
              <div className="flex flex-col items-center">
                <div
                  className="h-3 w-3 rounded-full shadow border"
                  style={{
                    backgroundColor: driverColors.accent,
                    borderColor: driverColors.border,
                    opacity: isActive ? 1 : 0.4,
                  }}
                />
                <span
                  className={cn("mt-1 rounded border px-1.5 py-0.5 text-[10px] shadow", isActive ? "opacity-100" : "opacity-70")}
                  style={{
                    backgroundColor: driverColors.background,
                    borderColor: driverColors.border,
                    color: driverColors.text,
                  }}
                >
                  {label}
                </span>
              </div>
            </Marker>
          );
        })}
        <OperationsBaseMarker location={operationsBaseLocation} />
      </MapGL>
    </div>
  );
}
