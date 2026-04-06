import { createLead, listLeads } from '../../_db.js';

const ALLOWED_STATUSES = new Set(['NEW', 'CONTACTED', 'QUOTED', 'WON', 'LOST']);
const ALLOWED_LOSS_REASONS = new Set([
  'NO_AVAILABILITY',
  'OUT_OF_AREA',
  'NO_RESPONSE',
  'PRICE',
  'HIRED_OTHER',
  'NOT_OUR_SERVICE',
  'OTHER',
]);

const parseBody = (req) => {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
};

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const isNullableString = (value) => value == null || typeof value === 'string';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const leads = await listLeads();
    res.status(200).json(leads);
    return;
  }

  if (req.method === 'POST') {
    const body = parseBody(req);
    if (!isNonEmptyString(body.id)) {
      res.status(400).json({ error: 'Missing id' });
      return;
    }
    if (!isNonEmptyString(body.clientName)) {
      res.status(400).json({ error: 'Missing clientName' });
      return;
    }
    if (!ALLOWED_STATUSES.has(body.status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    if (body.lossReason != null && !ALLOWED_LOSS_REASONS.has(body.lossReason)) {
      res.status(400).json({ error: 'Invalid lossReason' });
      return;
    }
    if (
      !isNullableString(body.clientPhone)
      || !isNullableString(body.description)
      || !isNullableString(body.requestedDate)
      || !isNullableString(body.requestedTime)
      || !isNullableString(body.originZone)
      || !isNullableString(body.destinationZone)
      || !isNullableString(body.notes)
    ) {
      res.status(400).json({ error: 'Invalid fields' });
      return;
    }
    const created = await createLead(body);
    res.status(201).json(created);
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
