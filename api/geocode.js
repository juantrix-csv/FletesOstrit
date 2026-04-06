import {
  buildMapboxGeocodeUrl,
  hasMapboxAccessToken,
  normalizeMapboxGeocodeResults,
} from './_mapbox.js';

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

  if (!hasMapboxAccessToken()) {
    res.status(500).json({ error: 'Missing Mapbox access token' });
    return;
  }

  try {
    const response = await fetch(buildMapboxGeocodeUrl(q, req.query || {}));
    if (!response.ok) {
      res.status(502).json({ error: 'Geocode failed' });
      return;
    }

    const data = await response.json();
    if (!Array.isArray(data?.features) || data.features.length === 0) {
      res.status(200).json([]);
      return;
    }

    if (data?.message) {
      res.status(502).json({ error: 'Geocode failed', detail: data.message });
      return;
    }

    res.status(200).json(normalizeMapboxGeocodeResults(data));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
