import { deleteDriverUnavailability } from '../../_db.js';

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const id = typeof req.query.id === 'string' ? req.query.id.trim() : null;
  if (!id) {
    res.status(400).json({ error: 'Missing id' });
    return;
  }

  const deleted = await deleteDriverUnavailability(id);
  if (!deleted) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.status(200).json({ ok: true });
}
