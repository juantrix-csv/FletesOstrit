import { useEffect, useRef } from 'react';
import { updateDriverLocation } from '../lib/api';
import type { DriverLocation } from '../lib/types';
import type { DriverSession } from '../lib/driverSession';

interface SyncOptions {
  session: DriverSession | null;
  jobId?: string | null;
  coords?: {
    lat: number;
    lng: number;
    accuracy: number;
    heading: number | null;
    speed: number | null;
  } | null;
}

export const useDriverLocationSync = ({ session, jobId, coords }: SyncOptions) => {
  const lastSentRef = useRef(0);
  const lastCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!session || !coords) return;
    const now = Date.now();
    const last = lastSentRef.current;
    const lastCoords = lastCoordsRef.current;
    const minInterval = 8000;
    const movedEnough = !lastCoords
      ? true
      : Math.abs(coords.lat - lastCoords.lat) > 0.0002 || Math.abs(coords.lng - lastCoords.lng) > 0.0002;

    if (!movedEnough && now - last < minInterval) return;

    lastSentRef.current = now;
    lastCoordsRef.current = { lat: coords.lat, lng: coords.lng };

    const payload: Omit<DriverLocation, 'updatedAt'> = {
      driverId: session.driverId,
      lat: coords.lat,
      lng: coords.lng,
      accuracy: coords.accuracy,
      heading: coords.heading,
      speed: coords.speed,
      jobId: jobId ?? null,
    };

    updateDriverLocation(payload).catch(() => {});
  }, [session, coords, jobId]);
};
