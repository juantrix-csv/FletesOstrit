import { useState, useEffect } from 'react';
export const useGeoLocation = () => {
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number; heading: number | null; speed: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!navigator.geolocation) { setError("No GPS"); return; }
    const id = navigator.geolocation.watchPosition(
      (pos) => setCoords({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
        speed: Number.isFinite(pos.coords.speed) ? pos.coords.speed : null,
      }),
      (err) => setError(err.message),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return { coords, error };
};
