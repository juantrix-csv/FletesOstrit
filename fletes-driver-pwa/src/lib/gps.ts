import { calculateDistance } from './utils';

export interface GpsPoint {
  lat: number;
  lng: number;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  recordedAt: number;
}

const MAX_RECENT_ACCURACY_METERS = 120;
const MAX_RECENT_INACCURATE_JUMP_METERS = 150;
const MAX_IMMEDIATE_JUMP_METERS = 120;
const MAX_SPEED_MPS = 55;
const MIN_DISTANCE_FOR_SPEED_CHECK_METERS = 250;
const RECENT_FIX_WINDOW_MS = 20_000;
const MIN_SPEED_CHECK_ELAPSED_MS = 1_000;

export const shouldAcceptGpsPoint = (
  previous: Pick<GpsPoint, 'lat' | 'lng' | 'recordedAt'> | null,
  next: GpsPoint,
) => {
  if (
    !Number.isFinite(next.lat) ||
    !Number.isFinite(next.lng) ||
    !Number.isFinite(next.recordedAt)
  ) {
    return false;
  }

  if (!previous) return true;

  const distance = calculateDistance(previous.lat, previous.lng, next.lat, next.lng);
  if (!Number.isFinite(distance)) return false;

  const elapsedMs = next.recordedAt - previous.recordedAt;

  if (
    Number.isFinite(next.accuracy) &&
    next.accuracy > MAX_RECENT_ACCURACY_METERS &&
    elapsedMs > 0 &&
    elapsedMs < RECENT_FIX_WINDOW_MS &&
    distance > Math.max(MAX_RECENT_INACCURATE_JUMP_METERS, next.accuracy * 1.5)
  ) {
    return false;
  }

  if (elapsedMs <= 0) {
    return distance <= MAX_IMMEDIATE_JUMP_METERS;
  }

  if (elapsedMs < MIN_SPEED_CHECK_ELAPSED_MS) {
    return distance <= MAX_IMMEDIATE_JUMP_METERS;
  }

  if (distance < MIN_DISTANCE_FOR_SPEED_CHECK_METERS) return true;

  const apparentSpeed = distance / (elapsedMs / 1000);
  return apparentSpeed <= MAX_SPEED_MPS;
};
