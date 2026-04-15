import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import OperationsBaseMarker from './OperationsBaseMarker';
import OperationsBaseServiceArea from './OperationsBaseServiceArea';
import { useOperationsBaseLocation } from '../hooks/useOperationsBaseLocation';
import type { DriverLocation, Job, LocationData } from '../lib/types';
import { applyMapPalette } from '../lib/mapStyle';
import { useMapProviderFallback } from '../lib/mapProvider';
import { cn } from '../lib/utils';

const BA_BOUNDS = { minLon: -63.9, minLat: -40.8, maxLon: -56.0, maxLat: -33.0 };
const fallbackLocation: LocationData = { address: 'La Plata', lat: -34.9214, lng: -57.9544 };
const EMPTY_STOPS: LocationData[] = [];

interface RoutePoint {
  lat: number;
  lng: number;
}

const buildRouteUrl = (points: RoutePoint[]) => {
  const url = new URL('/api/route', window.location.origin);
  url.searchParams.set('points', points.map((point) => `${point.lat},${point.lng}`).join('|'));
  return url.toString();
};

interface DriverRouteMapProps {
  location: DriverLocation | null;
  job: Job | null;
  className?: string;
}

export default function DriverRouteMap({ location, job, className }: DriverRouteMapProps) {
  const { location: operationsBaseLocation } = useOperationsBaseLocation();
  const { handleMapError, mapStyle } = useMapProviderFallback();
  const mapRef = useRef<MapRef | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [routeGeoJson, setRouteGeoJson] = useState<GeoJSON.Feature<GeoJSON.LineString> | null>(null);
  const [routeDurationSeconds, setRouteDurationSeconds] = useState<number | null>(null);

  const status = job?.status ?? 'PENDING';
  const pickup = job?.pickup ?? fallbackLocation;
  const dropoff = job?.dropoff ?? fallbackLocation;
  const extraStops = job?.extraStops ?? EMPTY_STOPS;
  const isValidLocation = (loc: { lat: number; lng: number }) =>
    Number.isFinite(loc.lat) &&
    Number.isFinite(loc.lng) &&
    loc.lat >= BA_BOUNDS.minLat &&
    loc.lat <= BA_BOUNDS.maxLat &&
    loc.lng >= BA_BOUNDS.minLon &&
    loc.lng <= BA_BOUNDS.maxLon;
  const extraStopsValid = useMemo(
    () => extraStops.filter((stop) => isValidLocation(stop)),
    [extraStops]
  );
  const rawStopIndex = typeof job?.stopIndex === 'number' && Number.isInteger(job.stopIndex) && job.stopIndex >= 0
    ? job.stopIndex
    : 0;
  const clampedStopIndex = Math.min(rawStopIndex, extraStopsValid.length);
  const hasPendingStops = status === 'TO_DROPOFF' && clampedStopIndex < extraStopsValid.length;
  const activeStop = hasPendingStops ? extraStopsValid[clampedStopIndex] : null;
  const pendingStops = useMemo(
    () => (status === 'TO_DROPOFF' ? extraStopsValid.slice(clampedStopIndex) : extraStopsValid),
    [status, extraStopsValid, clampedStopIndex]
  );
  const remainingStops = useMemo(
    () => (hasPendingStops ? extraStopsValid.slice(clampedStopIndex + 1) : []),
    [hasPendingStops, extraStopsValid, clampedStopIndex]
  );
  const target = useMemo(() => {
    if (!job) return null;
    if (job.status === 'PENDING' || job.status === 'TO_PICKUP' || job.status === 'LOADING') return pickup;
    if (job.status === 'TO_DROPOFF' && activeStop) return activeStop;
    return dropoff;
  }, [job, activeStop, pickup, dropoff]);
  const routePoints = useMemo<RoutePoint[]>(() => {
    if (!location || !target) return [];
    if (status === 'PENDING' || status === 'TO_PICKUP' || status === 'LOADING') {
      return [
        { lat: location.lat, lng: location.lng },
        { lat: target.lat, lng: target.lng },
      ];
    }
    if (status === 'TO_DROPOFF' && pendingStops.length > 0) {
      return [
        { lat: location.lat, lng: location.lng },
        ...pendingStops.map((stop) => ({ lat: stop.lat, lng: stop.lng })),
        { lat: dropoff.lat, lng: dropoff.lng },
      ];
    }
    return [
      { lat: location.lat, lng: location.lng },
      { lat: target.lat, lng: target.lng },
    ];
  }, [location?.lat, location?.lng, target?.lat, target?.lng, status, pendingStops, dropoff.lat, dropoff.lng]);
  const etaLabel = useMemo(() => {
    if (status !== 'TO_DROPOFF' || routeDurationSeconds == null || !Number.isFinite(routeDurationSeconds)) return null;
    const totalMinutes = Math.max(1, Math.round(routeDurationSeconds / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours <= 0) return `${totalMinutes} min`;
    if (minutes === 0) return `${hours} h`;
    return `${hours} h ${minutes} min`;
  }, [routeDurationSeconds, status]);

  useEffect(() => {
    if (routePoints.length < 2) {
      setRouteGeoJson(null);
      setRouteDurationSeconds(null);
      return;
    }
    const origin = routePoints[0];
    const destination = routePoints[routePoints.length - 1];
    if (!isValidLocation(origin) || !isValidLocation(destination)) {
      setRouteGeoJson(null);
      setRouteDurationSeconds(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const res = await fetch(buildRouteUrl(routePoints));
        if (!res.ok) throw new Error('route');
        const data = await res.json();
        const geometry = data?.geometry;
        if (!geometry || !geometry.coordinates?.length || !Number.isFinite(data?.durationSeconds)) {
          if (active) {
            setRouteGeoJson(null);
            setRouteDurationSeconds(null);
          }
          return;
        }
        if (active) {
          setRouteGeoJson({
            type: 'Feature',
            properties: {},
            geometry,
          });
          setRouteDurationSeconds(Number(data.durationSeconds));
        }
      } catch {
        if (active) {
          setRouteGeoJson(null);
          setRouteDurationSeconds(null);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [routePoints]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current.getMap();
    const points: Array<[number, number]> = [];
    if (location && isValidLocation(location)) points.push([location.lng, location.lat]);
    pendingStops.forEach((stop) => points.push([stop.lng, stop.lat]));
    if (target && isValidLocation(target)) points.push([target.lng, target.lat]);
    if (operationsBaseLocation && isValidLocation(operationsBaseLocation)) {
      points.push([operationsBaseLocation.lng, operationsBaseLocation.lat]);
    }

    if (points.length === 0) {
      const fallback = operationsBaseLocation && isValidLocation(operationsBaseLocation)
        ? operationsBaseLocation
        : fallbackLocation;
      map.easeTo({ center: [fallback.lng, fallback.lat], zoom: 11, duration: 400 });
      return;
    }
    if (points.length === 1) {
      map.easeTo({ center: [points[0][0], points[0][1]], zoom: 13, duration: 400 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds(points[0], points[0]);
    points.slice(1).forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, { padding: 80, duration: 500 });
  }, [location, mapReady, operationsBaseLocation, pendingStops, target]);

  return (
    <div className={cn('relative h-[360px] w-full overflow-hidden rounded-xl border bg-white', className)}>
      {etaLabel && (
        <div className="pointer-events-none absolute z-10 m-3 rounded-xl border border-emerald-200 bg-white/95 px-3 py-2 shadow-sm">
          <p className="text-[10px] uppercase tracking-wide text-emerald-600">Tiempo estimado al destino</p>
          <p className="text-sm font-semibold text-gray-900">{etaLabel}</p>
        </div>
      )}
      <Map
        ref={mapRef}
        initialViewState={{ latitude: fallbackLocation.lat, longitude: fallbackLocation.lng, zoom: 11 }}
        mapStyle={mapStyle}
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
        {routeGeoJson && (
          <Source id="driver-route" type="geojson" data={routeGeoJson}>
            <Layer
              id="driver-route-outline"
              type="line"
              paint={{ 'line-color': '#F4F4F4', 'line-width': 8, 'line-opacity': 0.8 }}
            />
            <Layer
              id="driver-route-line"
              type="line"
              paint={{ 'line-color': '#2563EB', 'line-width': 5, 'line-opacity': 0.9 }}
            />
          </Source>
        )}
        {location && (
          <Marker latitude={location.lat} longitude={location.lng}>
            <div className="h-3 w-3 rounded-full bg-blue-600 shadow" />
          </Marker>
        )}
        {(status === 'TO_DROPOFF' ? remainingStops : extraStopsValid).map((stop, index) => (
          <Marker key={`${stop.lat}-${stop.lng}-${index}`} latitude={stop.lat} longitude={stop.lng}>
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow" />
          </Marker>
        ))}
        {target && (
          <Marker latitude={target.lat} longitude={target.lng}>
            <div className={cn(
              'h-3 w-3 rounded-full shadow',
              status === 'PENDING' || status === 'TO_PICKUP' || status === 'LOADING' ? 'bg-green-600' : 'bg-red-600'
            )}
            />
          </Marker>
        )}
        <OperationsBaseMarker location={operationsBaseLocation} />
      </Map>
    </div>
  );
}
