import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { useGeoLocation } from '../hooks/useGeoLocation';
import { calculateDistance, cn } from '../lib/utils';
import type { LocationData } from '../lib/types';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

interface MapRouteProps {
  jobId: string;
  className?: string;
  mode?: 'preview' | 'driving';
}

interface RoutePoint {
  lat: number;
  lng: number;
}

const buildRouteUrl = (points: RoutePoint[]) => {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coords}`);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  return url.toString();
};

export default function MapRoute({ jobId, className, mode }: MapRouteProps) {
  const job = useLiveQuery(() => (jobId ? db.jobs.get(jobId) : undefined), [jobId]);
  const { coords } = useGeoLocation();
  const mapRef = useRef<MapRef | null>(null);
  const lastRouteRef = useRef<{ lat: number; lng: number; targetKey: string; at: number } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [routeGeoJson, setRouteGeoJson] = useState<GeoJSON.Feature<GeoJSON.LineString> | null>(null);

  const fallbackLocation: LocationData = { address: '', lat: 0, lng: 0 };
  const pickup = job?.pickup ?? fallbackLocation;
  const dropoff = job?.dropoff ?? fallbackLocation;
  const status = job?.status ?? 'PENDING';
  const isDriving = mode ? mode === 'driving' : status === 'TO_PICKUP' || status === 'TO_DROPOFF';
  const target = status.includes('PICKUP') ? pickup : dropoff;
  const driverLat = coords?.lat;
  const driverLng = coords?.lng;
  const driverHeading = coords?.heading ?? 0;
  const center: [number, number] = [
    (pickup.lat + dropoff.lat) / 2,
    (pickup.lng + dropoff.lng) / 2,
  ];

  const routePoints = useMemo<RoutePoint[]>(() => {
    if (isDriving && driverLat != null && driverLng != null) {
      return [
        { lat: driverLat, lng: driverLng },
        { lat: target.lat, lng: target.lng },
      ];
    }
    return [
      { lat: pickup.lat, lng: pickup.lng },
      { lat: dropoff.lat, lng: dropoff.lng },
    ];
  }, [isDriving, driverLat, driverLng, target.lat, target.lng, pickup.lat, pickup.lng, dropoff.lat, dropoff.lng]);

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
    const targetPoint = routePoints[routePoints.length - 1];
    if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) return;
    if (!Number.isFinite(targetPoint.lat) || !Number.isFinite(targetPoint.lng)) return;
    const targetKey = `${targetPoint.lat},${targetPoint.lng},${isDriving ? 'drive' : 'preview'}`;
    const now = Date.now();
    const last = lastRouteRef.current;
    if (last && last.targetKey === targetKey && now - last.at < 10000) {
      const distance = calculateDistance(origin.lat, origin.lng, last.lat, last.lng);
      if (distance < 40) return;
    }
    lastRouteRef.current = { lat: origin.lat, lng: origin.lng, targetKey, at: now };
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
  }, [job?.id, routePoints, isDriving]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current.getMap();
    if (isDriving || !job) return;
    map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
    const bounds = new maplibregl.LngLatBounds(
      [pickup.lng, pickup.lat],
      [dropoff.lng, dropoff.lat]
    );
    map.fitBounds(bounds, { padding: 40, duration: 800 });
  }, [mapReady, isDriving, job?.id, pickup.lat, pickup.lng, dropoff.lat, dropoff.lng]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (!isDriving || !coords) return;
    const map = mapRef.current.getMap();
    const zoom = Math.max(map.getZoom(), 15.5);
    const bearing = Number.isFinite(driverHeading) ? driverHeading : map.getBearing();
    map.easeTo({
      center: [coords.lng, coords.lat],
      zoom,
      bearing,
      pitch: 45,
      duration: 500,
      offset: [0, 120],
    });
  }, [mapReady, isDriving, coords?.lat, coords?.lng, driverHeading]);

  const driverRotation = Number.isFinite(driverHeading) ? driverHeading : 0;

  if (!job) {
    return (
      <div className={cn("w-full min-h-[400px] h-[400px] rounded-xl bg-gray-100 flex items-center justify-center text-sm text-gray-600", className)}>
        Cargando mapa...
      </div>
    );
  }

  return (
    <div className={cn("w-full min-h-[400px] h-[400px] rounded-xl overflow-hidden", className)}>
      <Map
        ref={mapRef}
        initialViewState={{ latitude: center[0], longitude: center[1], zoom: 13 }}
        mapStyle={MAP_STYLE}
        onLoad={() => setMapReady(true)}
        reuseMaps
        attributionControl={false}
        style={{ width: '100%', height: '100%' }}
      >
        {routeGeoJson && (
          <Source id="route" type="geojson" data={routeGeoJson}>
            <Layer
              id="route-outline"
              type="line"
              paint={{ 'line-color': '#93c5fd', 'line-width': 8, 'line-opacity': 0.5 }}
            />
            <Layer
              id="route-line"
              type="line"
              paint={{ 'line-color': '#2563eb', 'line-width': 5, 'line-opacity': 0.9 }}
            />
          </Source>
        )}
        {!isDriving && (
          <>
            <Marker latitude={pickup.lat} longitude={pickup.lng}>
              <div className="h-3 w-3 rounded-full bg-green-600 shadow" />
            </Marker>
            <Marker latitude={dropoff.lat} longitude={dropoff.lng}>
              <div className="h-3 w-3 rounded-full bg-red-600 shadow" />
            </Marker>
          </>
        )}
        {isDriving && (
          <Marker latitude={target.lat} longitude={target.lng}>
            <div className="h-3 w-3 rounded-full bg-red-600 shadow" />
          </Marker>
        )}
        {coords && (
          <Marker latitude={coords.lat} longitude={coords.lng}>
            <div className="driver-marker">
              <div className="driver-arrow" style={{ transform: `rotate(${driverRotation}deg)` }} />
            </div>
          </Marker>
        )}
      </Map>
    </div>
  );
}
