import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Marker, type MapMouseEvent, type MapRef } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import OperationsBaseMarker from './OperationsBaseMarker';
import OperationsBaseServiceArea from './OperationsBaseServiceArea';
import { useOperationsBaseLocation } from '../hooks/useOperationsBaseLocation';
import type { LocationData } from '../lib/types';
import { reverseGeocodeLocation } from '../lib/geocode';
import { applyMapPalette } from '../lib/mapStyle';
import { useMapProviderFallback } from '../lib/mapProvider';
import { cn } from '../lib/utils';

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
  extraStops?: LocationData[];
  active: 'pickup' | 'dropoff' | 'extra';
  onSelect: (kind: 'pickup' | 'dropoff' | 'extra', location: LocationData) => void;
  focusLocation?: LocationData | null;
  className?: string;
}

export default function MapLocationPicker({
  pickup,
  dropoff,
  extraStops = [],
  active,
  onSelect,
  focusLocation,
  className,
}: MapLocationPickerProps) {
  const { location: operationsBaseLocation } = useOperationsBaseLocation();
  const { handleMapError, mapStyle } = useMapProviderFallback();
  const activeLocation = active === 'pickup'
    ? pickup
    : active === 'dropoff'
      ? dropoff
      : extraStops.length > 0
        ? extraStops[extraStops.length - 1]
        : null;
  const focusValid = focusLocation ? isWithinBounds(focusLocation.lat, focusLocation.lng) : false;
  const center = useMemo(
    () => activeLocation ?? pickup ?? dropoff ?? operationsBaseLocation ?? fallbackLocation,
    [activeLocation, operationsBaseLocation, pickup, dropoff]
  );
  const mapRef = useRef<MapRef | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!mapReady || !mapRef.current || focusValid) return;
    const map = mapRef.current.getMap();
    const points: Array<[number, number]> = [];
    if (pickup && isWithinBounds(pickup.lat, pickup.lng)) points.push([pickup.lng, pickup.lat]);
    if (dropoff && isWithinBounds(dropoff.lat, dropoff.lng)) points.push([dropoff.lng, dropoff.lat]);
    extraStops.forEach((stop) => {
      if (isWithinBounds(stop.lat, stop.lng)) points.push([stop.lng, stop.lat]);
    });
    if (operationsBaseLocation && isWithinBounds(operationsBaseLocation.lat, operationsBaseLocation.lng)) {
      points.push([operationsBaseLocation.lng, operationsBaseLocation.lat]);
    }

    if (points.length >= 2) {
      const bounds = new maplibregl.LngLatBounds(points[0], points[0]);
      points.slice(1).forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, { padding: 70, duration: 450 });
      return;
    }

    map.easeTo({ center: [center.lng, center.lat], duration: 400 });
  }, [
    center.lat,
    center.lng,
    dropoff?.lat,
    dropoff?.lng,
    extraStops,
    focusValid,
    mapReady,
    operationsBaseLocation?.lat,
    operationsBaseLocation?.lng,
    pickup?.lat,
    pickup?.lng,
  ]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !focusValid || !focusLocation) return;
    mapRef.current.easeTo({ center: [focusLocation.lng, focusLocation.lat], zoom: 13.5, duration: 450 });
  }, [focusLocation?.lat, focusLocation?.lng, focusValid, mapReady]);

  const handleClick = async (event: MapMouseEvent) => {
    const { lng, lat } = event.lngLat;
    if (!isWithinBounds(lat, lng)) return;
    const requestId = ++requestIdRef.current;
    const fallbackAddress = formatMapAddress(lat, lng);
    const location = await reverseGeocodeLocation(lat, lng, fallbackAddress);
    if (requestId !== requestIdRef.current) return;
    onSelect(active, location);
  };

  return (
    <div className={cn('h-[240px] w-full overflow-hidden rounded border bg-white', className)}>
      <Map
        ref={mapRef}
        initialViewState={{ latitude: center.lat, longitude: center.lng, zoom: 11.5 }}
        mapStyle={mapStyle}
        onClick={handleClick}
        onLoad={() => {
          setMapReady(true);
          const map = mapRef.current?.getMap();
          if (map) applyMapPalette(map);
        }}
        onError={handleMapError}
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
        <OperationsBaseServiceArea location={operationsBaseLocation} />
        {pickup && (
          <Marker latitude={pickup.lat} longitude={pickup.lng}>
            <div className={cn('h-3 w-3 rounded-full bg-green-600 shadow', active === 'pickup' ? 'ring-2 ring-green-200' : 'ring-2 ring-white')} />
          </Marker>
        )}
        {dropoff && (
          <Marker latitude={dropoff.lat} longitude={dropoff.lng}>
            <div className={cn('h-3 w-3 rounded-full bg-red-600 shadow', active === 'dropoff' ? 'ring-2 ring-red-200' : 'ring-2 ring-white')} />
          </Marker>
        )}
        {extraStops.map((stop, index) => (
          <Marker key={`${stop.lat}-${stop.lng}-${index}`} latitude={stop.lat} longitude={stop.lng}>
            <div className={cn('h-2.5 w-2.5 rounded-full bg-amber-500 shadow', active === 'extra' && index === extraStops.length - 1 ? 'ring-2 ring-amber-200' : 'ring-2 ring-white')} />
          </Marker>
        ))}
        {focusValid && focusLocation && (
          <Marker latitude={focusLocation.lat} longitude={focusLocation.lng}>
            <div className="h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-600 shadow" />
          </Marker>
        )}
        <OperationsBaseMarker location={operationsBaseLocation} />
      </Map>
    </div>
  );
}
