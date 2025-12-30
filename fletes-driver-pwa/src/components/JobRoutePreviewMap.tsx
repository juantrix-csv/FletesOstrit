import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import type { Job, LocationData } from '../lib/types';
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

interface JobRoutePreviewMapProps {
  job: Job | null;
  className?: string;
  focusLocation?: LocationData | null;
}

export default function JobRoutePreviewMap({ job, className, focusLocation }: JobRoutePreviewMapProps) {
  const mapRef = useRef<MapRef | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [routeGeoJson, setRouteGeoJson] = useState<GeoJSON.Feature<GeoJSON.LineString> | null>(null);

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
  const pickupValid = isValidLocation(pickup);
  const dropoffValid = isValidLocation(dropoff);
  const focusValid = focusLocation ? isValidLocation(focusLocation) : false;

  const routePoints = useMemo<RoutePoint[]>(() => {
    const points: RoutePoint[] = [];
    if (pickupValid) points.push({ lat: pickup.lat, lng: pickup.lng });
    extraStopsValid.forEach((stop) => points.push({ lat: stop.lat, lng: stop.lng }));
    if (dropoffValid) points.push({ lat: dropoff.lat, lng: dropoff.lng });
    return points;
  }, [pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, pickupValid, dropoffValid, extraStopsValid]);

  useEffect(() => {
    if (!job) {
      setRouteGeoJson(null);
      return;
    }
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
  }, [job?.id, routePoints]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current.getMap();
    if (routePoints.length === 0) {
      map.easeTo({ center: [fallbackLocation.lng, fallbackLocation.lat], zoom: 11, duration: 400 });
      return;
    }
    if (routePoints.length === 1) {
      map.easeTo({ center: [routePoints[0].lng, routePoints[0].lat], zoom: 13, duration: 400 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds(
      [routePoints[0].lng, routePoints[0].lat],
      [routePoints[0].lng, routePoints[0].lat]
    );
    routePoints.slice(1).forEach((point) => bounds.extend([point.lng, point.lat]));
    map.fitBounds(bounds, { padding: 80, duration: 500 });
  }, [mapReady, routePoints]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (!focusValid || !focusLocation) return;
    const map = mapRef.current.getMap();
    map.easeTo({ center: [focusLocation.lng, focusLocation.lat], zoom: 13.5, duration: 450 });
  }, [mapReady, focusValid, focusLocation?.lat, focusLocation?.lng]);

  if (!job) {
    return (
      <div className={cn("min-h-[360px] w-full rounded-xl border bg-gray-100 flex items-center justify-center text-sm text-gray-600", className)}>
        Cargando mapa...
      </div>
    );
  }

  return (
    <div className={cn("min-h-[360px] w-full overflow-hidden rounded-xl border bg-white", className)}>
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
          <Source id="job-route" type="geojson" data={routeGeoJson}>
            <Layer
              id="job-route-outline"
              type="line"
              paint={{ 'line-color': '#F4F4F4', 'line-width': 8, 'line-opacity': 0.8 }}
            />
            <Layer
              id="job-route-line"
              type="line"
              paint={{ 'line-color': '#6B6B6B', 'line-width': 5, 'line-opacity': 0.9 }}
            />
          </Source>
        )}
        {pickupValid && (
          <Marker latitude={pickup.lat} longitude={pickup.lng}>
            <div className="h-3 w-3 rounded-full bg-green-600 shadow" />
          </Marker>
        )}
        {extraStopsValid.map((stop, index) => (
          <Marker key={`${stop.lat}-${stop.lng}-${index}`} latitude={stop.lat} longitude={stop.lng}>
            <div className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow" />
          </Marker>
        ))}
        {dropoffValid && (
          <Marker latitude={dropoff.lat} longitude={dropoff.lng}>
            <div className="h-3 w-3 rounded-full bg-red-600 shadow" />
          </Marker>
        )}
        {focusValid && focusLocation && (
          <Marker latitude={focusLocation.lat} longitude={focusLocation.lng}>
            <div className="h-3.5 w-3.5 rounded-full border-2 border-white bg-blue-600 shadow" />
          </Marker>
        )}
      </Map>
    </div>
  );
}
