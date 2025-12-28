const buildReverseUrl = (lat, lon, params) => {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', lat);
  url.searchParams.set('lon', lon);
  url.searchParams.set('format', params.format || 'jsonv2');
  url.searchParams.set('zoom', params.zoom || '18');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'es');
  if (process.env.NOMINATIM_EMAIL) {
    url.searchParams.set('email', process.env.NOMINATIM_EMAIL);
  }
  return url.toString();
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
    const url = buildReverseUrl(lat, lon, req.query || {});
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FletesDriverPWA/1.0 (vercel)',
      },
    });
    if (!response.ok) {
      res.status(502).json({ error: 'Reverse geocode failed' });
      return;
    }
    const data = await response.json();
    res.status(200).json(data);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
}
