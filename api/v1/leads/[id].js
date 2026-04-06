import { deleteLead, getLeadById, updateLead } from '../../_db.js';

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
  const { id } = req.query;

  if (req.method === 'GET') {
    const lead = await getLeadById(id);
    if (!lead) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json(lead);
    return;
  }

  if (req.method === 'PATCH') {
    const body = parseBody(req);
    if (Object.prototype.hasOwnProperty.call(body, 'clientName') && !isNonEmptyString(body.clientName)) {
      res.status(400).json({ error: 'Invalid clientName' });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'status') && !ALLOWED_STATUSES.has(body.status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'lossReason') && body.lossReason != null && !ALLOWED_LOSS_REASONS.has(body.lossReason)) {
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
      || !isNullableString(body.historyNote)
    ) {
      res.status(400).json({ error: 'Invalid fields' });
      return;
    }
    const updated = await updateLead(id, body);
    if (!updated) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(200).json(updated);
    return;
  }

  if (req.method === 'DELETE') {
    const removed = await deleteLead(id);
    if (!removed) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).send();
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
