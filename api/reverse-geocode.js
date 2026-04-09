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
    if (hasMapboxAccessToken()) {
      try {
        const response = await fetch(buildMapboxReverseGeocodeUrl(lat, lon));
        const data = await readJsonSafe(response);

        if (response.ok && !data?.message) {
          if (!Array.isArray(data?.features) || data.features.length === 0) {
            res.status(200).json({ display_name: null });
            return;
          }

          res.status(200).json(normalizeMapboxReverseGeocodeResult(data));
          return;
        }
      } catch {
        // Fall back to OpenStreetMap providers on upstream Mapbox failures.
      }
    }

    const fallbackResponse = await fetch(
      buildOpenMapsReverseGeocodeUrl(lat, lon),
      getOpenMapsRequestOptions()
    );
    if (!fallbackResponse.ok) {
      res.status(502).json({ error: 'Reverse geocode failed' });
      return;
    }

    const fallbackData = await readJsonSafe(fallbackResponse);
    res.status(200).json(normalizeOpenMapsReverseGeocodeResult(fallbackData));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
