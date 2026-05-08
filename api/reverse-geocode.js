import {
  buildMapboxReverseGeocodeUrl,
  hasMapboxAccessToken,
  normalizeMapboxReverseGeocodeResult,
} from './_mapbox.js';
import {
  buildOpenMapsReverseGeocodeUrl,
  getOpenMapsRequestOptions,
  normalizeOpenMapsReverseGeocodeResult,
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

  const lat = req.query?.lat;
  const lon = req.query?.lon;
  if (typeof lat !== 'string' || typeof lon !== 'string') {
    res.status(400).json({ error: 'Missing coordinates' });
    return;
  }
  const latNum = Number(lat);
  const lonNum = Number(lon);
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    res.status(400).json({ error: 'Invalid coordinates' });
    return;
  }

  try {
    const tryOpenMaps = async () => {
      const response = await fetch(
        buildOpenMapsReverseGeocodeUrl(lat, lon),
        getOpenMapsRequestOptions()
      );
      if (!response.ok) {
        return false;
      }

      const data = await readJsonSafe(response);
      res.status(200).json(normalizeOpenMapsReverseGeocodeResult(data));
      return true;
    };

    const tryMapbox = async () => {
      if (!hasMapboxAccessToken()) {
        return false;
      }

      try {
        const response = await fetch(buildMapboxReverseGeocodeUrl(lat, lon));
        const data = await readJsonSafe(response);

        if (response.ok && !data?.message) {
          if (!Array.isArray(data?.features) || data.features.length === 0) {
            res.status(200).json({ display_name: null });
            return;
          }

          res.status(200).json(normalizeMapboxReverseGeocodeResult(data));
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

    res.status(502).json({ error: 'Reverse geocode failed' });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
