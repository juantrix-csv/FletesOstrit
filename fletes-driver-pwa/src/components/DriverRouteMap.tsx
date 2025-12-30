import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import type { DriverLocation, Job, LocationData } from '../lib/types';
import { MAP_STYLE, applyMapPalette } from '../lib/mapStyle';
import { cn } from '../lib/utils';

const BA_BOUNDS = { minLon: -63.9, minLat: -40.8, maxLon: -56.0, maxLat: -33.0 };
const fallbackLocation: LocationData = { address: 'La Plata', lat: -34.9214, lng: -57.9544 };
const EMPTY_STOPS: LocationData[] = [];

interface RoutePoint {
  lat: number;
  lng: number;
}

const buildRouteUrl = (points: RoutePoint[]) => {
  const coords = points.map((point) => `${point.lng},${point.lat}`).join(';');
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coords}`);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  return url.toString();
};

interface DriverRouteMapProps {
  location: DriverLocation | null;
  job: Job | null;
  className?: string;
}

export default function DriverRouteMap({ location, job, className }: DriverRouteMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [routeGeoJson, setRouteGeoJson] = useState<GeoJSON.Feature<GeoJSON.LineString> | null>(null);

  const target = useMemo(() => {
    if (!job) return null;
    if (job.status.includes('PICKUP')) return job.pickup;
    if (job.status === 'PENDING') return job.pickup;
    return job.dropoff;
  }, [job]);
  const status = job?.status ?? 'PENDING';
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
  const routePoints = useMemo<RoutePoint[]>(() => {
    if (!location || !target) return [];
    if (status.includes('PICKUP') || status === 'PENDING') {
      return [
        { lat: location.lat, lng: location.lng },
        { lat: target.lat, lng: target.lng },
      ];
    }
    if (extraStopsValid.length > 0) {
      return [
        { lat: location.lat, lng: location.lng },
        ...extraStopsValid.map((stop) => ({ lat: stop.lat, lng: stop.lng })),
        { lat: target.lat, lng: target.lng },
      ];
    }
    return [
      { lat: location.lat, lng: location.lng },
      { lat: target.lat, lng: target.lng },
    ];
  }, [location?.lat, location?.lng, target?.lat, target?.lng, status, extraStopsValid]);

  useEffect(() => {
    if (routePoints.length < 2) {
      setRouteGeoJson(null);
      return;
    }
    const origin = routePoints[0];
    const destination = routePoints[routePoints.length - 1];
    if (!isValidLocation(origin) || !isValidLocation(destination)) {
      setRouteGeoJson(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const res = await fetch(buildRouteUrl(routePoints));
        if (!res.ok) throw new Error('route');
        const data = await res.json();
        const geometry = data?.routes?.[0]?.geometry;
        if (!geometry || !geometry.coordinates?.length) {
          if (active) setRouteGeoJson(null);
          return;
        }
        if (active) {
          setRouteGeoJson({
            type: 'Feature',
            properties: {},
            geometry,
          });
        }
      } catch {
        if (active) setRouteGeoJson(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [routePoints]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current.getMap();
    if (!location && !target) {
      map.easeTo({ center: [fallbackLocation.lng, fallbackLocation.lat], zoom: 11, duration: 400 });
      return;
    }
    if (location && !target) {
      map.easeTo({ center: [location.lng, location.lat], zoom: 13, duration: 400 });
      return;
    }
    if (location && target) {
      const points: Array<[number, number]> = [[location.lng, location.lat]];
      extraStopsValid.forEach((stop) => points.push([stop.lng, stop.lat]));
      points.push([target.lng, target.lat]);
      const bounds = new maplibregl.LngLatBounds(points[0], points[0]);
      points.slice(1).forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, { padding: 80, duration: 500 });
    }
  }, [mapReady, location?.lat, location?.lng, target?.lat, target?.lng, extraStopsValid]);

  return (
    <div className={cn("h-[360px] w-full overflow-hidden rounded-xl border bg-white", className)}>
      <Map
        ref={mapRef}
        initialViewState={{ latitude: fallbackLocation.lat, longitude: fallbackLocation.lng, zoom: 11 }}
        mapStyle={MAP_STYLE}
        onLoad={() => {
          setMapReady(true);
          const map = mapRef.current?.getMap();
          if (map) applyMapPalette(map);
        }}
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
        {routeGeoJson && (
          <Source id="driver-route" type="geojson" data={routeGeoJson}>
            <Layer
              id="driver-route-outline"
              type="line"
              paint={{ 'line-color': '#93c5fd', 'line-width': 8, 'line-opacity': 0.5 }}
            />
            <Layer
              id="driver-route-line"
              type="line"
              paint={{ 'line-color': '#2563eb', 'line-width': 5, 'line-opacity': 0.9 }}
            />
          </Source>
        )}
        {location && (
          <Marker latitude={location.lat} longitude={location.lng}>
            <div className="h-3 w-3 rounded-full bg-blue-600 shadow" />
          </Marker>
        )}
        {extraStopsValid.map((stop, index) => (
          <Marker key={`${stop.lat}-${stop.lng}-${index}`} latitude={stop.lat} longitude={stop.lng}>
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow" />
          </Marker>
        ))}
        {target && (
          <Marker latitude={target.lat} longitude={target.lng}>
            <div className={cn("h-3 w-3 rounded-full shadow", job?.status?.includes('PICKUP') ? "bg-green-600" : "bg-red-600")} />
          </Marker>
        )}
      </Map>
    </div>
  );
}
