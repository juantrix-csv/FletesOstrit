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
import { preferOpenMaps } from './_mapPreference.js';

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
    const tryOpenMaps = async () => {
      const response = await fetch(
        buildOpenMapsGeocodeUrl(q, req.query || {}),
        getOpenMapsRequestOptions()
      );
      if (!response.ok) {
        return false;
      }

      const data = await readJsonSafe(response);
      res.status(200).json(normalizeOpenMapsGeocodeResults(data));
      return true;
    };

    const tryMapbox = async () => {
      if (!hasMapboxAccessToken()) {
        return false;
      }

      try {
        const response = await fetch(buildMapboxGeocodeUrl(q, req.query || {}));
        const data = await readJsonSafe(response);

        if (response.ok && !data?.message) {
          if (!Array.isArray(data?.features) || data.features.length === 0) {
            res.status(200).json([]);
            return;
          }

          res.status(200).json(normalizeMapboxGeocodeResults(data));
          return true;
        }
      } catch {
        // Fall back to OpenStreetMap providers on upstream Mapbox failures.
      }

      return false;
    };

    const handlers = preferOpenMaps()
      ? [tryOpenMaps, tryMapbox]
      : [tryMapbox, tryOpenMaps];

    for (const execute of handlers) {
      if (await execute()) return;
    }

    res.status(502).json({ error: 'Geocode failed' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
