import { useEffect, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import type { DriverLocation, Job, LocationData } from '../lib/types';
import { cn } from '../lib/utils';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
const BA_BOUNDS = { minLon: -63.9, minLat: -40.8, maxLon: -56.0, maxLat: -33.0 };
const fallbackLocation: LocationData = { address: 'La Plata', lat: -34.9214, lng: -57.9544 };

const buildRouteUrl = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
  const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
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

  useEffect(() => {
    if (!location || !target) {
      setRouteGeoJson(null);
      return;
    }
    let active = true;
    (async () => {
      try {
        const res = await fetch(buildRouteUrl({ lat: location.lat, lng: location.lng }, target));
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
  }, [location?.lat, location?.lng, target?.lat, target?.lng]);

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
      const bounds = new maplibregl.LngLatBounds(
        [location.lng, location.lat],
        [target.lng, target.lat]
      );
      map.fitBounds(bounds, { padding: 80, duration: 500 });
    }
  }, [mapReady, location?.lat, location?.lng, target?.lat, target?.lng]);

  return (
    <div className={cn("h-[360px] w-full overflow-hidden rounded-xl border bg-white", className)}>
      <Map
        ref={mapRef}
        initialViewState={{ latitude: fallbackLocation.lat, longitude: fallbackLocation.lng, zoom: 11 }}
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
        {target && (
          <Marker latitude={target.lat} longitude={target.lng}>
            <div className={cn("h-3 w-3 rounded-full shadow", job?.status?.includes('PICKUP') ? "bg-green-600" : "bg-red-600")} />
          </Marker>
        )}
      </Map>
    </div>
  );
}
