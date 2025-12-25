const buildSearchUrl = (query, params) => {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', params.limit || '5');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'es');
  if (params.countrycodes) url.searchParams.set('countrycodes', params.countrycodes);
  if (params.bounded) url.searchParams.set('bounded', params.bounded);
  if (params.viewbox) url.searchParams.set('viewbox', params.viewbox);
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
  const q = req.query?.q;
  if (!q || typeof q !== 'string' || q.trim().length < 3) {
    res.status(400).json({ error: 'Missing query' });
    return;
  }
  try {
    const url = buildSearchUrl(q, req.query || {});
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'FletesDriverPWA/1.0 (vercel)',
      },
    });
    if (!response.ok) {
      res.status(502).json({ error: 'Geocode failed' });
      return;
    }
    const data = await response.json();
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}
