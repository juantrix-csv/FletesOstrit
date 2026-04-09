import { describe, expect, it } from 'vitest';
import { shouldAcceptGpsPoint, type GpsPoint } from './gps';

const createPoint = (overrides: Partial<GpsPoint> = {}): GpsPoint => ({
  lat: -34.9214,
  lng: -57.9544,
  accuracy: 20,
  heading: null,
  speed: null,
  recordedAt: 1_000,
  ...overrides,
});

describe('shouldAcceptGpsPoint', () => {
  it('accepts the first fix', () => {
    expect(shouldAcceptGpsPoint(null, createPoint())).toBe(true);
  });

  it('rejects impossible jumps over a short interval', () => {
    const previous = createPoint();
    const next = createPoint({
      lat: -34.9124,
      lng: -57.9544,
      recordedAt: previous.recordedAt + 1_000,
    });

    expect(shouldAcceptGpsPoint(previous, next)).toBe(false);
  });

  it('accepts plausible movement over time', () => {
    const previous = createPoint();
    const next = createPoint({
      lat: -34.9124,
      lng: -57.9544,
      recordedAt: previous.recordedAt + 60_000,
    });

    expect(shouldAcceptGpsPoint(previous, next)).toBe(true);
  });

  it('rejects recent inaccurate jumps', () => {
    const previous = createPoint();
    const next = createPoint({
      lat: -34.9184,
      lng: -57.9544,
      accuracy: 220,
      recordedAt: previous.recordedAt + 5_000,
    });

    expect(shouldAcceptGpsPoint(previous, next)).toBe(false);
  });

  it('allows an inaccurate fix after a long gap if the movement is plausible', () => {
    const previous = createPoint();
    const next = createPoint({
      lat: -34.9184,
      lng: -57.9544,
      accuracy: 220,
      recordedAt: previous.recordedAt + 5 * 60_000,
    });

    expect(shouldAcceptGpsPoint(previous, next)).toBe(true);
  });
});
