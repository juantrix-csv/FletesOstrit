import { useEffect, useRef, useState } from 'react';
import { type GpsPoint, shouldAcceptGpsPoint } from '../lib/gps';

export const useGeoLocation = () => {
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number; heading: number | null; speed: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastAcceptedRef = useRef<GpsPoint | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) { setError("No GPS"); return; }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const nextCoords: GpsPoint = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
          speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
          recordedAt: Number.isFinite(pos.timestamp) ? pos.timestamp : Date.now(),
        };

        if (!shouldAcceptGpsPoint(lastAcceptedRef.current, nextCoords)) return;

        lastAcceptedRef.current = nextCoords;
        setError(null);
        setCoords({
          lat: nextCoords.lat,
          lng: nextCoords.lng,
          accuracy: nextCoords.accuracy,
          heading: nextCoords.heading,
          speed: nextCoords.speed,
        });
      },
      (err) => setError(err.message),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return { coords, error };
};
