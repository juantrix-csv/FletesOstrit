import {
  buildMapboxReverseGeocodeUrl,
  hasMapboxAccessToken,
  normalizeMapboxReverseGeocodeResult,
} from './_mapbox.js';

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

  if (!hasMapboxAccessToken()) {
    res.status(500).json({ error: 'Missing Mapbox access token' });
    return;
  }

  try {
    const response = await fetch(buildMapboxReverseGeocodeUrl(lat, lon));
    if (!response.ok) {
      res.status(502).json({ error: 'Reverse geocode failed' });
      return;
    }

    const data = await response.json();
    if (!Array.isArray(data?.features) || data.features.length === 0) {
      res.status(200).json({ display_name: null });
      return;
    }

    if (data?.message) {
      res.status(502).json({ error: 'Reverse geocode failed', detail: data.message });
      return;
    }

    res.status(200).json(normalizeMapboxReverseGeocodeResult(data));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
