import { createLead, listLeads } from '../../_db.js';

const ALLOWED_STATUSES = new Set(['LOST']);
const ALLOWED_LOSS_REASONS = new Set([
  'NO_AVAILABILITY',
  'OUT_OF_AREA',
  'NO_RESPONSE',
  'PRICE',
  'HIRED_OTHER',
  'NOT_OUR_SERVICE',
  'OTHER',
]);
const ALLOWED_REQUESTED_SLOTS = new Set(['NOW', 'TODAY', 'TOMORROW', 'THIS_WEEK', 'UNSPECIFIED']);
const ALLOWED_JOB_TYPES = new Set(['FLETE_SIMPLE', 'MUDANZA', 'CON_AYUDANTE', 'RETIRO_ENTREGA', 'UNSPECIFIED']);

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
    if (body.status != null && !ALLOWED_STATUSES.has(body.status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    if (!ALLOWED_LOSS_REASONS.has(body.lossReason)) {
      res.status(400).json({ error: 'Invalid lossReason' });
      return;
    }
    if (body.requestedSlot != null && !ALLOWED_REQUESTED_SLOTS.has(body.requestedSlot)) {
      res.status(400).json({ error: 'Invalid requestedSlot' });
      return;
    }
    if (body.jobType != null && !ALLOWED_JOB_TYPES.has(body.jobType)) {
      res.status(400).json({ error: 'Invalid jobType' });
      return;
    }
    if (
      !isNullableString(body.clientPhone)
      || !isNullableString(body.description)
      || !isNullableString(body.clientName)
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

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
