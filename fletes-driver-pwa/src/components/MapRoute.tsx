import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import Map, { Layer, Marker, Source, type MapRef } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import { useGeoLocation } from '../hooks/useGeoLocation';
import { calculateDistance, cn } from '../lib/utils';
import type { Job, LocationData } from '../lib/types';
import { MAP_STYLE, applyMapPalette } from '../lib/mapStyle';

const EMPTY_STOPS: LocationData[] = [];

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

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeHeading = (value: number) => ((value % 360) + 360) % 360;

const interpolateHeading = (from: number, to: number, t: number) => {
  const start = normalizeHeading(from);
  const end = normalizeHeading(to);
  let diff = end - start;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return normalizeHeading(start + diff * t);
};

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

const buildRouteUrl = (points: RoutePoint[]) => {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = new URL(`https://router.project-osrm.org/route/v1/driving/${coords}`);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  return url.toString();
};

const getFitPadding = (map: maplibregl.Map) => {
  const container = map.getContainer();
  const minSize = Math.min(container.clientWidth, container.clientHeight);
  const base = Math.round(Math.min(140, Math.max(60, (minSize || 400) * 0.18)));
  return { top: base, bottom: base, left: base, right: base };
};

const MapRoute = forwardRef<MapRouteHandle, MapRouteProps>(({ job, className, mode }, ref) => {
  const { coords } = useGeoLocation();
  const mapRef = useRef<MapRef | null>(null);
  const lastRouteRef = useRef<{ lat: number; lng: number; targetKey: string; at: number } | null>(null);
  const smoothRef = useRef<{
    start: { lat: number; lng: number; heading: number | null; speed: number | null; accuracy: number };
    target: { lat: number; lng: number; heading: number | null; speed: number | null; accuracy: number };
    startTime: number;
    duration: number;
  } | null>(null);
  const smoothedCoordsRef = useRef<typeof coords | null>(null);
  const animationRef = useRef<number | null>(null);
  const manualViewUntilRef = useRef<number | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [routeGeoJson, setRouteGeoJson] = useState<GeoJSON.Feature<GeoJSON.LineString> | null>(null);
  const [smoothedCoords, setSmoothedCoords] = useState<typeof coords | null>(null);

  const fallbackLocation: LocationData = { address: 'La Plata', lat: -34.9214, lng: -57.9544 };
  const pickup = job?.pickup ?? fallbackLocation;
  const dropoff = job?.dropoff ?? fallbackLocation;
  const extraStops = job?.extraStops ?? EMPTY_STOPS;
  const status = job?.status ?? 'PENDING';
  const isDriving = mode ? mode === 'driving' : status === 'TO_PICKUP' || status === 'TO_DROPOFF';
  const target = status.includes('PICKUP') ? pickup : dropoff;
  const driverLat = coords?.lat;
  const driverLng = coords?.lng;
  const driverHeading = coords?.heading ?? 0;
  const displayCoords = smoothedCoords ?? coords;
  const displayHeading = Number.isFinite(displayCoords?.heading) ? displayCoords?.heading ?? 0 : driverHeading;
  const BA_BOUNDS = { minLon: -63.9, minLat: -40.8, maxLon: -56.0, maxLat: -33.0 };
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
  const targetValid = isValidLocation(target);
  const centerLat = pickupValid && dropoffValid ? (pickup.lat + dropoff.lat) / 2 : pickupValid ? pickup.lat : dropoffValid ? dropoff.lat : fallbackLocation.lat;
  const centerLng = pickupValid && dropoffValid ? (pickup.lng + dropoff.lng) / 2 : pickupValid ? pickup.lng : dropoffValid ? dropoff.lng : fallbackLocation.lng;
  const center: [number, number] = [centerLat, centerLng];
  const [viewMode, setViewMode] = useState<'route' | 'follow'>(() => (isDriving ? 'follow' : 'route'));
  const [manualView, setManualView] = useState(false);

  useEffect(() => {
    if (!coords) {
      smoothedCoordsRef.current = null;
      smoothRef.current = null;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      setSmoothedCoords(null);
      return;
    }
    const current = smoothedCoordsRef.current ?? coords;
    const distance = calculateDistance(current.lat, current.lng, coords.lat, coords.lng);
    if (!Number.isFinite(distance) || distance > 350) {
      smoothedCoordsRef.current = coords;
      setSmoothedCoords(coords);
      smoothRef.current = null;
      return;
    }
    const duration = clampNumber(distance * 12, 300, 1200);
    smoothRef.current = {
      start: {
        lat: current.lat,
        lng: current.lng,
        heading: current.heading ?? null,
        speed: current.speed ?? null,
        accuracy: current.accuracy,
      },
      target: {
        lat: coords.lat,
        lng: coords.lng,
        heading: coords.heading ?? null,
        speed: coords.speed ?? null,
        accuracy: coords.accuracy,
      },
      startTime: performance.now(),
      duration,
    };
    if (animationRef.current == null) {
      animationRef.current = requestAnimationFrame(function tick(now) {
        const state = smoothRef.current;
        if (!state) {
          animationRef.current = null;
          return;
        }
        const rawT = clampNumber((now - state.startTime) / state.duration, 0, 1);
        const eased = easeOutCubic(rawT);
        const nextLat = state.start.lat + (state.target.lat - state.start.lat) * eased;
        const nextLng = state.start.lng + (state.target.lng - state.start.lng) * eased;
        const nextHeading = state.start.heading != null && state.target.heading != null
          ? interpolateHeading(state.start.heading, state.target.heading, eased)
          : state.target.heading ?? state.start.heading ?? null;
        const next = {
          lat: nextLat,
          lng: nextLng,
          accuracy: state.target.accuracy,
          heading: nextHeading,
          speed: state.target.speed ?? null,
        };
        smoothedCoordsRef.current = next;
        setSmoothedCoords(next);
        if (rawT < 1) {
          animationRef.current = requestAnimationFrame(tick);
          return;
        }
        smoothRef.current = null;
        animationRef.current = null;
      });
    }
  }, [coords?.lat, coords?.lng, coords?.heading, coords?.speed, coords?.accuracy]);

  const routePoints = useMemo<RoutePoint[]>(() => {
    if (isDriving && driverLat != null && driverLng != null) {
      if (status === 'TO_DROPOFF' && extraStopsValid.length > 0) {
        return [
          { lat: driverLat, lng: driverLng },
          ...extraStopsValid.map((stop) => ({ lat: stop.lat, lng: stop.lng })),
          { lat: dropoff.lat, lng: dropoff.lng },
        ];
      }
      return [
        { lat: driverLat, lng: driverLng },
        { lat: target.lat, lng: target.lng },
      ];
    }
    return [
      { lat: pickup.lat, lng: pickup.lng },
      ...extraStopsValid.map((stop) => ({ lat: stop.lat, lng: stop.lng })),
      { lat: dropoff.lat, lng: dropoff.lng },
    ];
  }, [isDriving, driverLat, driverLng, target.lat, target.lng, pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, extraStopsValid, status]);

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
    const points: Array<[number, number]> = [];
    if (pickupValid) points.push([pickup.lng, pickup.lat]);
    extraStopsValid.forEach((stop) => points.push([stop.lng, stop.lat]));
    if (dropoffValid) points.push([dropoff.lng, dropoff.lat]);
    if (points.length < 2) {
      map.easeTo({ center: [fallbackLocation.lng, fallbackLocation.lat], zoom: 12, duration: 600 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds(points[0], points[0]);
    points.slice(1).forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, { padding: getFitPadding(map), duration: 800 });
  }, [mapReady, isDriving, job?.id, pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, pickupValid, dropoffValid, extraStopsValid, viewMode]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (!isDriving || !coords) return;
    if (viewMode !== 'follow') return;
    const map = mapRef.current.getMap();
    const zoom = Math.max(map.getZoom(), 15.5);
    const bearing = Number.isFinite(displayHeading) ? displayHeading : map.getBearing();
    map.easeTo({
      center: [coords.lng, coords.lat],
      zoom,
      bearing,
      pitch: 45,
      duration: 500,
      offset: [0, 120],
    });
  }, [mapReady, isDriving, coords?.lat, coords?.lng, displayHeading, viewMode]);

  const driverRotation = Number.isFinite(displayHeading) ? displayHeading : 0;

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current.getMap();
    const points: Array<[number, number]> = [];
    if (pickupValid) points.push([pickup.lng, pickup.lat]);
    extraStopsValid.forEach((stop) => points.push([stop.lng, stop.lat]));
    if (dropoffValid) points.push([dropoff.lng, dropoff.lat]);
    if (coords && isValidLocation(coords)) points.push([coords.lng, coords.lat]);
    if (points.length === 0) return;
    const bounds = new maplibregl.LngLatBounds(points[0], points[0]);
    points.slice(1).forEach((point) => bounds.extend(point));
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const latSpan = Math.max(0.02, (ne.lat - sw.lat) * 0.2);
    const lngSpan = Math.max(0.02, (ne.lng - sw.lng) * 0.2);
    const maxBounds = new maplibregl.LngLatBounds(
      [sw.lng - lngSpan, sw.lat - latSpan],
      [ne.lng + lngSpan, ne.lat + latSpan]
    );
    map.setMaxBounds(maxBounds);
  }, [mapReady, pickupValid, dropoffValid, coords?.lat, coords?.lng, pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, extraStopsValid]);

  useEffect(() => {
    if (!job) return;
    setManualView(false);
    manualViewUntilRef.current = null;
    setViewMode(isDriving ? 'follow' : 'route');
  }, [job?.id]);

  useEffect(() => {
    if (manualView) return;
    setViewMode(isDriving ? 'follow' : 'route');
  }, [isDriving, manualView]);

  useEffect(() => {
    if (!isDriving || !manualView) return;
    if (viewMode !== 'route') return;
    const until = manualViewUntilRef.current;
    if (!until) return;
    if (Date.now() >= until) {
      manualViewUntilRef.current = null;
      setManualView(false);
      setViewMode('follow');
    }
  }, [isDriving, manualView, viewMode, coords?.lat, coords?.lng]);

  const fitRoute = () => {
    if (!mapReady || !mapRef.current) return false;
    setManualView(true);
    manualViewUntilRef.current = Date.now() + 12000;
    setViewMode('route');
    const map = mapRef.current.getMap();
    map.easeTo({ pitch: 0, bearing: 0, duration: 0 });
    const points: Array<{ lat: number; lng: number }> = [];
    if (isDriving) {
      if (coords && isValidLocation(coords)) {
        points.push({ lat: coords.lat, lng: coords.lng });
      }
      if (status === 'TO_DROPOFF') {
        extraStopsValid.forEach((stop) => points.push({ lat: stop.lat, lng: stop.lng }));
      }
      if (targetValid) {
        points.push({ lat: target.lat, lng: target.lng });
      }
    } else {
      if (pickupValid) points.push({ lat: pickup.lat, lng: pickup.lng });
      extraStopsValid.forEach((stop) => points.push({ lat: stop.lat, lng: stop.lng }));
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
    map.fitBounds(bounds, { padding: getFitPadding(map), duration: 800 });
    return true;
  };

  const centerOnUser = () => {
    if (!mapReady || !mapRef.current || !coords) return false;
    setManualView(false);
    manualViewUntilRef.current = null;
    setViewMode('follow');
    const map = mapRef.current.getMap();
    const zoom = Math.max(map.getZoom(), 15.5);
    const bearing = Number.isFinite(displayHeading) ? displayHeading : map.getBearing();
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
  }), [mapReady, coords, pickupValid, dropoffValid, displayHeading, status, targetValid, extraStopsValid]);

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
        onLoad={() => {
          setMapReady(true);
          const map = mapRef.current?.getMap();
          if (map) applyMapPalette(map);
        }}
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
              paint={{ 'line-color': '#F4F4F4', 'line-width': 8, 'line-opacity': 0.8 }}
            />
            <Layer
              id="route-line"
              type="line"
              paint={{ 'line-color': '#2563EB', 'line-width': 5, 'line-opacity': 0.9 }}
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
          </>
        )}
        {isDriving && (
          <>
            {status === 'TO_DROPOFF' && extraStopsValid.map((stop, index) => (
              <Marker key={`${stop.lat}-${stop.lng}-${index}`} latitude={stop.lat} longitude={stop.lng}>
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow" />
              </Marker>
            ))}
            {targetValid && (
              <Marker latitude={target.lat} longitude={target.lng}>
                <div className="h-3 w-3 rounded-full bg-red-600 shadow" />
              </Marker>
            )}
          </>
        )}
        {displayCoords && (
          <Marker latitude={displayCoords.lat} longitude={displayCoords.lng}>
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
