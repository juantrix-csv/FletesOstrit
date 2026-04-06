import {
  buildMapboxDirectionsUrl,
  hasMapboxAccessToken,
  normalizeMapboxDirectionsResult,
} from './_mapbox.js';

const parsePoints = (value) => {
  if (typeof value !== 'string') return [];
  return value
    .split('|')
    .map((segment) => {
      const [lat, lng] = segment.split(',').map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return { lat, lng };
    })
    .filter(Boolean);
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!hasMapboxAccessToken()) {
    res.status(500).json({ error: 'Missing Mapbox access token' });
    return;
  }

  const points = parsePoints(req.query?.points);
  if (points.length < 2) {
    res.status(400).json({ error: 'Missing route points' });
    return;
  }

  try {
    const response = await fetch(buildMapboxDirectionsUrl(points));
    if (!response.ok) {
      res.status(502).json({ error: 'Route failed' });
      return;
    }

    const data = await response.json();
    if (!Array.isArray(data?.routes) || data.routes.length === 0) {
      res.status(200).json({
        geometry: null,
        distanceMeters: null,
        durationSeconds: null,
      });
      return;
    }

    if (data?.message) {
      res.status(502).json({ error: 'Route failed', detail: data.message });
      return;
    }

    res.status(200).json(normalizeMapboxDirectionsResult(data));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
