import {
  buildMapboxGeocodeUrl,
  hasMapboxAccessToken,
  normalizeMapboxGeocodeResults,
} from './_mapbox.js';
import {
  buildOpenMapsGeocodeUrl,
  getOpenMapsRequestOptions,
  normalizeOpenMapsGeocodeResults,
} from './_openmaps.js';

const readJsonSafe = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const q = req.query?.q;
  if (!q || typeof q !== 'string' || q.trim().length < 3) {
    res.status(400).json({ error: 'Missing query' });
    return;
  }

  try {
    if (hasMapboxAccessToken()) {
      try {
        const response = await fetch(buildMapboxGeocodeUrl(q, req.query || {}));
        const data = await readJsonSafe(response);

        if (response.ok && !data?.message) {
          if (!Array.isArray(data?.features) || data.features.length === 0) {
            res.status(200).json([]);
            return;
          }

          res.status(200).json(normalizeMapboxGeocodeResults(data));
          return;
        }
      } catch {
        // Fall back to OpenStreetMap providers on upstream Mapbox failures.
      }
    }

    const fallbackResponse = await fetch(
      buildOpenMapsGeocodeUrl(q, req.query || {}),
      getOpenMapsRequestOptions()
    );
    if (!fallbackResponse.ok) {
      res.status(502).json({ error: 'Geocode failed' });
      return;
    }

    const fallbackData = await readJsonSafe(fallbackResponse);
    const normalized = normalizeOpenMapsGeocodeResults(fallbackData);
    res.status(200).json(normalized);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
