import {
  buildMapboxDirectionsUrl,
  hasMapboxAccessToken,
  normalizeMapboxDirectionsResult,
} from './_mapbox.js';
import {
  buildOpenMapsDirectionsUrl,
  getOpenMapsRequestOptions,
  normalizeOpenMapsDirectionsResult,
} from './_openmaps.js';

const readJsonSafe = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

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

  const points = parsePoints(req.query?.points);
  if (points.length < 2) {
    res.status(400).json({ error: 'Missing route points' });
    return;
  }

  try {
    if (hasMapboxAccessToken()) {
      try {
        const response = await fetch(buildMapboxDirectionsUrl(points));
        const data = await readJsonSafe(response);

        if (response.ok && !data?.message) {
          if (!Array.isArray(data?.routes) || data.routes.length === 0) {
            res.status(200).json({
              geometry: null,
              distanceMeters: null,
              durationSeconds: null,
            });
            return;
          }

          res.status(200).json(normalizeMapboxDirectionsResult(data));
          return;
        }
      } catch {
        // Fall back to OpenStreetMap providers on upstream Mapbox failures.
      }
    }

    const fallbackResponse = await fetch(
      buildOpenMapsDirectionsUrl(points),
      getOpenMapsRequestOptions()
    );
    if (!fallbackResponse.ok) {
      res.status(502).json({ error: 'Route failed' });
      return;
    }

    const fallbackData = await readJsonSafe(fallbackResponse);
    if (!Array.isArray(fallbackData?.routes) || fallbackData.routes.length === 0) {
      res.status(200).json({
        geometry: null,
        distanceMeters: null,
        durationSeconds: null,
      });
      return;
    }

    res.status(200).json(normalizeOpenMapsDirectionsResult(fallbackData));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
