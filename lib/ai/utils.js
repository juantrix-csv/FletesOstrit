import { DEFAULT_KNOWN, REQUIRED_FIELDS_ORDER } from './types.js';

export const computeMissingFields = (known = DEFAULT_KNOWN) => {
  const missing = [];
  const hasDate = Boolean(known.date_pref);
  const hasTime = Boolean(known.time_pref);

  if (!known.pickup) missing.push('pickup');
  else if (!known.dropoff) missing.push('dropoff');
  else if (!known.items) missing.push('items');
  else if (!hasDate || !hasTime) missing.push('datetime');
  else if (known.helpers == null) missing.push('helpers');

  return missing;
};

export const normalizeSlots = (slots) => {
  if (!Array.isArray(slots)) return [];
  return slots
    .map((slot, index) => {
      if (slot == null) return null;
      if (typeof slot === 'string') {
        return { id: String(index + 1), label: slot };
      }
      const id = slot.id ?? slot.slot_id ?? slot.code ?? String(index + 1);
      const label = slot.label ?? slot.name ?? slot.title ?? slot.start ?? slot.time ?? String(id);
      return { ...slot, id: String(id), label: String(label) };
    })
    .filter(Boolean);
};

export const extractSlotSelection = (message, slots) => {
  const normalizedSlots = normalizeSlots(slots);
  if (!message || normalizedSlots.length === 0) return null;
  const text = String(message).toLowerCase();

  for (const slot of normalizedSlots) {
    const idText = String(slot.id).toLowerCase();
    if (idText && text.includes(idText)) {
      return slot;
    }
  }

  const indexMatch = text.match(/\b([1-9])\b/);
  if (indexMatch) {
    const index = Number(indexMatch[1]) - 1;
    if (normalizedSlots[index]) return normalizedSlots[index];
  }

  for (const slot of normalizedSlots) {
    const label = String(slot.label || '').toLowerCase();
    if (label && text.includes(label)) {
      return slot;
    }
    const timeMatch = label.match(/\b(\d{1,2}:\d{2})\b/);
    if (timeMatch && text.includes(timeMatch[1])) {
      return slot;
    }
  }

  return null;
};

export const parseHelpersFromText = (message) => {
  if (!message) return null;
  const text = String(message).toLowerCase();
  if (/(no|sin)\s+ayudante/.test(text) || /no necesito/.test(text) || /sin ayuda/.test(text)) {
    return 0;
  }
  if (/con\s+ayudante/.test(text) || /necesito\s+ayudante/.test(text) || /si\s+ayudante/.test(text)) {
    return 1;
  }
  if (/no\b/.test(text)) return 0;
  if (/si\b/.test(text)) return 1;
  return null;
};

export const extractDateTimeFromText = (message) => {
  if (!message) return {};
  const text = String(message);
  const dateIso = text.match(/\b(20\d{2}-\d{1,2}-\d{1,2})\b/);
  const dateSlash = text.match(/\b(\d{1,2}\/\d{1,2})(?:\/\d{2,4})?\b/);
  const timeMatch = text.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/);

  return {
    date_pref: dateIso ? dateIso[1] : dateSlash ? dateSlash[1] : null,
    time_pref: timeMatch ? timeMatch[0] : null,
  };
};

export const buildSchedulePayload = (known, selection) => {
  return {
    pickup: known.pickup,
    dropoff: known.dropoff,
    items: known.items,
    date_pref: known.date_pref,
    time_pref: known.time_pref,
    helpers: known.helpers,
    floors: known.floors,
    elevator: known.elevator,
    notes: known.notes,
    slot: selection ?? null,
  };
};

export const countQuestions = (text) => {
  if (!text) return 0;
  const matches = String(text).match(/[\?¿]/g);
  return matches ? matches.length : 0;
};

export const containsEmoji = (text) => {
  if (!text) return false;
  return /[\u{1F300}-\u{1FAFF}]/u.test(String(text));
};

export const ensureOrder = (fields) => {
  const order = REQUIRED_FIELDS_ORDER;
  return fields.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
};