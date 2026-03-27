import { useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import OperationsBaseMarker from './OperationsBaseMarker';
import { useOperationsBaseLocation } from '../hooks/useOperationsBaseLocation';
import type { Driver, DriverLocation, Job, JobStatus } from '../lib/types';
import { MAP_STYLE, applyMapPalette } from '../lib/mapStyle';
import { calculateDistance, cn } from '../lib/utils';
import { getDriverColors } from '../lib/driverColors';

const BA_BOUNDS = { minLon: -63.9, minLat: -40.8, maxLon: -56.0, maxLat: -33.0 };
const fallbackCenter = { lat: -34.9214, lng: -57.9544 };
const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' } as const;
const MAX_BOUNDS: [[number, number], [number, number]] = [
  [BA_BOUNDS.minLon, BA_BOUNDS.minLat],
  [BA_BOUNDS.maxLon, BA_BOUNDS.maxLat],
];
const EMPTY_STOPS: Array<{ lat: number; lng: number }> = [];

interface RoutePoint {
  lat: number;
  lng: number;
}

interface DriversOverviewMapProps {
  locations: DriverLocation[];
  drivers: Driver[];
  jobs: Job[];
  className?: string;
}

const statusMeta: Record<JobStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pendiente', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  TO_PICKUP: { label: 'A recoger', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  LOADING: { label: 'Cargando', className: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  TO_DROPOFF: { label: 'En viaje', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  UNLOADING: { label: 'Descargando', className: 'bg-teal-100 text-teal-700 border-teal-200' },
  DONE: { label: 'Finalizado', className: 'bg-gray-200 text-gray-600 border-gray-300' },
};

const buildRouteUrl = (points: RoutePoint[]) => {
  const coords = points.map((point) => `${point.lng},${point.lat}`).join(';');
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coords}`);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  return url.toString();
};

const isValidLocation = (loc: { lat: number; lng: number }) =>
  Number.isFinite(loc.lat) &&
  Number.isFinite(loc.lng) &&
  loc.lat >= BA_BOUNDS.minLat &&
  loc.lat <= BA_BOUNDS.maxLat &&
  loc.lng >= BA_BOUNDS.minLon &&
  loc.lng <= BA_BOUNDS.maxLon;

export default function DriversOverviewMap({ locations, drivers, jobs, className }: DriversOverviewMapProps) {
  const { location: operationsBaseLocation } = useOperationsBaseLocation();
  const mapRef = useRef<MapRef | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const hasFitRef = useRef(false);
  const lastViewportKeyRef = useRef('');
  const routeCacheRef = useRef(new Map<string, {
    feature: GeoJSON.Feature<GeoJSON.LineString>;
    origin: RoutePoint;
    signature: string;
    at: number;
  }>());
  const [routeGeoJsonByDriverId, setRouteGeoJsonByDriverId] = useState<Record<string, GeoJSON.Feature<GeoJSON.LineString>>>({});

  const driversById = useMemo(() => {
    const map = new Map<string, Driver>();
    drivers.forEach((driver) => map.set(driver.id, driver));
    return map;
  }, [drivers]);
  const initialViewState = useMemo(
    () => ({ latitude: fallbackCenter.lat, longitude: fallbackCenter.lng, zoom: 10 }),
    []
  );
  const jobsById = useMemo(() => {
    const map = new Map<string, Job>();
    jobs.forEach((job) => map.set(job.id, job));
    return map;
  }, [jobs]);
  const activeJobsByDriverId = useMemo(() => {
    const map = new Map<string, Job>();
    jobs.forEach((job) => {
      if (!job.driverId || job.status === 'DONE' || job.status === 'PENDING') return;
      const current = map.get(job.driverId);
      if (!current) {
        map.set(job.driverId, job);
        return;
      }
      const currentUpdatedAt = new Date(current.updatedAt).getTime();
      const nextUpdatedAt = new Date(job.updatedAt).getTime();
      if (nextUpdatedAt >= currentUpdatedAt) {
        map.set(job.driverId, job);
      }
    });
    return map;
  }, [jobs]);
  const routeSpecs = useMemo(() => locations.flatMap((loc) => {
    const activeJob = (loc.jobId ? jobsById.get(loc.jobId) : null) ?? activeJobsByDriverId.get(loc.driverId) ?? null;
    if (!activeJob || (activeJob.status !== 'TO_PICKUP' && activeJob.status !== 'TO_DROPOFF')) return [];

    const extraStops = (activeJob.extraStops ?? EMPTY_STOPS).filter((stop) => isValidLocation(stop));
    const rawStopIndex = typeof activeJob.stopIndex === 'number' && Number.isInteger(activeJob.stopIndex) && activeJob.stopIndex >= 0
      ? activeJob.stopIndex
      : 0;
    const clampedStopIndex = Math.min(rawStopIndex, extraStops.length);
    const pendingStops = activeJob.status === 'TO_DROPOFF' ? extraStops.slice(clampedStopIndex) : EMPTY_STOPS;
    const points = activeJob.status === 'TO_DROPOFF'
      ? [
          { lat: loc.lat, lng: loc.lng },
          ...pendingStops.map((stop) => ({ lat: stop.lat, lng: stop.lng })),
          { lat: activeJob.dropoff.lat, lng: activeJob.dropoff.lng },
        ]
      : [
          { lat: loc.lat, lng: loc.lng },
          { lat: activeJob.pickup.lat, lng: activeJob.pickup.lng },
        ];
    if (points.length < 2 || points.some((point) => !isValidLocation(point))) return [];

    return [{
      driverId: loc.driverId,
      color: getDriverColors(loc.driverId).accent,
      points,
    }];
  }), [activeJobsByDriverId, jobsById, locations]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const points: Array<[number, number]> = locations.map((loc) => [loc.lng, loc.lat]);
    routeSpecs.forEach((route) => {
      route.points.forEach((point) => points.push([point.lng, point.lat]));
    });
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
  }, [locations, mapReady, operationsBaseLocation, routeSpecs]);

  useEffect(() => {
    if (routeSpecs.length === 0) {
      setRouteGeoJsonByDriverId({});
      routeCacheRef.current.clear();
      return;
    }

    let active = true;

    (async () => {
      const nextRoutes: Record<string, GeoJSON.Feature<GeoJSON.LineString>> = {};

      await Promise.all(routeSpecs.map(async (route) => {
        const signature = route.points.map((point) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`).join('|');
        const cached = routeCacheRef.current.get(route.driverId);
        const origin = route.points[0];

        if (cached && cached.signature === signature && Date.now() - cached.at < 10000) {
          const movedMeters = calculateDistance(origin.lat, origin.lng, cached.origin.lat, cached.origin.lng);
          if (movedMeters < 40) {
            nextRoutes[route.driverId] = cached.feature;
            return;
          }
        }

        try {
          const res = await fetch(buildRouteUrl(route.points));
          if (!res.ok) throw new Error('route');
          const data = await res.json();
          const geometry = data?.routes?.[0]?.geometry;
          if (!geometry || !geometry.coordinates?.length) throw new Error('route');
          const feature: GeoJSON.Feature<GeoJSON.LineString> = {
            type: 'Feature',
            properties: {},
            geometry,
          };
          routeCacheRef.current.set(route.driverId, {
            feature,
            origin,
            signature,
            at: Date.now(),
          });
          nextRoutes[route.driverId] = feature;
        } catch {
          if (cached) {
            nextRoutes[route.driverId] = cached.feature;
          }
        }
      }));

      if (active) {
        setRouteGeoJsonByDriverId(nextRoutes);
      }
    })();

    return () => {
      active = false;
    };
  }, [routeSpecs]);

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
        {routeSpecs.map((route) => {
          const feature = routeGeoJsonByDriverId[route.driverId];
          if (!feature) return null;
          return (
            <Source key={`driver-route-${route.driverId}`} id={`driver-route-${route.driverId}`} type="geojson" data={feature}>
              <Layer
                id={`driver-route-outline-${route.driverId}`}
                type="line"
                paint={{ 'line-color': '#F4F4F4', 'line-width': 7, 'line-opacity': 0.72 }}
              />
              <Layer
                id={`driver-route-line-${route.driverId}`}
                type="line"
                paint={{ 'line-color': route.color, 'line-width': 4.5, 'line-opacity': 0.92 }}
              />
            </Source>
          );
        })}
        {locations.map((loc) => {
          const driver = driversById.get(loc.driverId);
          const label = driver ? driver.name : 'Conductor';
          const driverColors = getDriverColors(loc.driverId);
          const isActive = driver?.active ?? false;
          const activeJob = (loc.jobId ? jobsById.get(loc.jobId) : null) ?? activeJobsByDriverId.get(loc.driverId) ?? null;
          const status = activeJob ? statusMeta[activeJob.status] : null;
          const statusLabel = status
            ? status.label
            : isActive
              ? 'Disponible'
              : 'Inactivo';
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
                <span
                  className={cn(
                    'mt-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-sm',
                    status?.className ?? (isActive ? 'bg-slate-100 text-slate-700 border-slate-200' : 'bg-gray-100 text-gray-500 border-gray-200')
                  )}
                >
                  {statusLabel}
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
