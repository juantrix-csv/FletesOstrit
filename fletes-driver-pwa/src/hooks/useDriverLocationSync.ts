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
  const coordsRef = useRef<typeof coords>(null);

  useEffect(() => {
    coordsRef.current = coords ?? null;
  }, [coords]);

  useEffect(() => {
    if (!session) return;

    const sendLocation = (current: NonNullable<typeof coords>) => {
      const now = Date.now();
      const last = lastSentRef.current;
      const lastCoords = lastCoordsRef.current;
      const minInterval = 8000;
      const movedEnough = !lastCoords
        ? true
        : Math.abs(current.lat - lastCoords.lat) > 0.0002 || Math.abs(current.lng - lastCoords.lng) > 0.0002;

      if (!movedEnough && now - last < minInterval) return;

      lastSentRef.current = now;
      lastCoordsRef.current = { lat: current.lat, lng: current.lng };

      const payload: Omit<DriverLocation, 'updatedAt'> = {
        driverId: session.driverId,
        lat: current.lat,
        lng: current.lng,
        accuracy: current.accuracy,
        heading: current.heading,
        speed: current.speed,
        jobId: jobId ?? null,
      };

      updateDriverLocation(payload).catch(() => {});
    };

    if (coords) {
      sendLocation(coords);
    }

    const id = window.setInterval(() => {
      const current = coordsRef.current;
      if (current) {
        sendLocation(current);
      }
    }, 15000);

    return () => clearInterval(id);
  }, [session, jobId, coords]);
};
