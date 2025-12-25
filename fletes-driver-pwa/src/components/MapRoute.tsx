import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import { useGeoLocation } from '../hooks/useGeoLocation';
import { calculateDistance, cn } from '../lib/utils';
import type { Job, LocationData } from '../lib/types';

const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

export interface MapRouteHandle {
  centerOnUser: () => boolean;
  fitRoute: () => boolean;
}

interface MapRouteProps {
  job: Job | null;
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

const MapRoute = forwardRef<MapRouteHandle, MapRouteProps>(({ job, className, mode }, ref) => {
  const { coords } = useGeoLocation();
  const mapRef = useRef<MapRef | null>(null);
  const lastRouteRef = useRef<{ lat: number; lng: number; targetKey: string; at: number } | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [routeGeoJson, setRouteGeoJson] = useState<GeoJSON.Feature<GeoJSON.LineString> | null>(null);

  const fallbackLocation: LocationData = { address: 'La Plata', lat: -34.9214, lng: -57.9544 };
  const pickup = job?.pickup ?? fallbackLocation;
  const dropoff = job?.dropoff ?? fallbackLocation;
  const status = job?.status ?? 'PENDING';
  const isDriving = mode ? mode === 'driving' : status === 'TO_PICKUP' || status === 'TO_DROPOFF';
  const target = status.includes('PICKUP') ? pickup : dropoff;
  const driverLat = coords?.lat;
  const driverLng = coords?.lng;
  const driverHeading = coords?.heading ?? 0;
  const BA_BOUNDS = { minLon: -63.9, minLat: -40.8, maxLon: -56.0, maxLat: -33.0 };
  const isValidLocation = (loc: { lat: number; lng: number }) =>
    Number.isFinite(loc.lat) &&
    Number.isFinite(loc.lng) &&
    loc.lat >= BA_BOUNDS.minLat &&
    loc.lat <= BA_BOUNDS.maxLat &&
    loc.lng >= BA_BOUNDS.minLon &&
    loc.lng <= BA_BOUNDS.maxLon;
  const pickupValid = isValidLocation(pickup);
  const dropoffValid = isValidLocation(dropoff);
  const targetValid = isValidLocation(target);
  const centerLat = pickupValid && dropoffValid ? (pickup.lat + dropoff.lat) / 2 : pickupValid ? pickup.lat : dropoffValid ? dropoff.lat : fallbackLocation.lat;
  const centerLng = pickupValid && dropoffValid ? (pickup.lng + dropoff.lng) / 2 : pickupValid ? pickup.lng : dropoffValid ? dropoff.lng : fallbackLocation.lng;
  const center: [number, number] = [centerLat, centerLng];
  const [viewMode, setViewMode] = useState<'route' | 'follow'>(() => (isDriving ? 'follow' : 'route'));

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
    if (!isValidLocation(origin) || !isValidLocation(targetPoint)) {
      setRouteGeoJson(null);
      return;
    }
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
    if (viewMode !== 'route') return;
    map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
    if (!pickupValid || !dropoffValid) {
      map.easeTo({ center: [fallbackLocation.lng, fallbackLocation.lat], zoom: 12, duration: 600 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds(
      [pickup.lng, pickup.lat],
      [dropoff.lng, dropoff.lat]
    );
    map.fitBounds(bounds, { padding: 40, duration: 800 });
  }, [mapReady, isDriving, job?.id, pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, pickupValid, dropoffValid, viewMode]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (!isDriving || !coords) return;
    if (viewMode !== 'follow') return;
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
  }, [mapReady, isDriving, coords?.lat, coords?.lng, driverHeading, viewMode]);

  const driverRotation = Number.isFinite(driverHeading) ? driverHeading : 0;

  useEffect(() => {
    if (!job) return;
    setViewMode(isDriving ? 'follow' : 'route');
  }, [job?.id, isDriving]);

  const fitRoute = () => {
    if (!mapReady || !mapRef.current) return false;
    setViewMode('route');
    const map = mapRef.current.getMap();
    map.easeTo({ pitch: 0, bearing: 0, duration: 0 });
    const points: Array<{ lat: number; lng: number }> = [];
    if (isDriving) {
      if (coords && isValidLocation(coords)) {
        points.push({ lat: coords.lat, lng: coords.lng });
      }
      if (targetValid) {
        points.push({ lat: target.lat, lng: target.lng });
      }
    } else {
      if (pickupValid) points.push({ lat: pickup.lat, lng: pickup.lng });
      if (dropoffValid) points.push({ lat: dropoff.lat, lng: dropoff.lng });
    }

    if (points.length === 0) {
      map.easeTo({ center: [fallbackLocation.lng, fallbackLocation.lat], zoom: 12, duration: 600 });
      return true;
    }
    if (points.length === 1) {
      map.easeTo({ center: [points[0].lng, points[0].lat], zoom: 14, duration: 500 });
      return true;
    }
    const bounds = new maplibregl.LngLatBounds(
      [points[0].lng, points[0].lat],
      [points[0].lng, points[0].lat]
    );
    points.slice(1).forEach((point) => bounds.extend([point.lng, point.lat]));
    map.fitBounds(bounds, { padding: 40, duration: 800 });
    return true;
  };

  const centerOnUser = () => {
    if (!mapReady || !mapRef.current || !coords) return false;
    setViewMode('follow');
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
    return true;
  };

  useImperativeHandle(ref, () => ({
    centerOnUser,
    fitRoute,
  }), [mapReady, coords, pickupValid, dropoffValid, driverHeading]);

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
        interactive={false}
        scrollZoom={false}
        dragPan={false}
        dragRotate={false}
        doubleClickZoom={false}
        touchZoomRotate={false}
        touchPitch={false}
        keyboard={false}
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
            {pickupValid && (
              <Marker latitude={pickup.lat} longitude={pickup.lng}>
                <div className="h-3 w-3 rounded-full bg-green-600 shadow" />
              </Marker>
            )}
            {dropoffValid && (
              <Marker latitude={dropoff.lat} longitude={dropoff.lng}>
                <div className="h-3 w-3 rounded-full bg-red-600 shadow" />
              </Marker>
            )}
          </>
        )}
        {isDriving && targetValid && (
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
});

MapRoute.displayName = 'MapRoute';

export default MapRoute;
