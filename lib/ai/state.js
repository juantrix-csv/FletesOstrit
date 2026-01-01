import { DEFAULT_STATE, DEFAULT_KNOWN } from './types.js';

const memoryStore = new Map();

const getTtlSeconds = () => {
  const ttl = Number(process.env.STATE_TTL_SECONDS ?? 60 * 60 * 24 * 7);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 60 * 60 * 24 * 7;
};

const getKey = (contactId) => `ai:state:${contactId}`;

const hasUpstash = () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

const upstashFetch = async (command) => {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.error ?? response.statusText;
    throw new Error(`Upstash error: ${response.status} ${detail}`);
  }
  return payload?.result ?? null;
};

const normalizeState = (state) => ({
  ...DEFAULT_STATE,
  ...state,
  known: { ...DEFAULT_KNOWN, ...(state?.known ?? {}) },
  history: Array.isArray(state?.history) ? state.history : [],
  last_offer_slots: Array.isArray(state?.last_offer_slots) ? state.last_offer_slots : [],
});

export const getState = async (contactId) => {
  if (!contactId) return normalizeState();
  const key = getKey(contactId);

  if (hasUpstash()) {
    const result = await upstashFetch(['GET', key]);
    if (!result) return normalizeState();
    try {
      return normalizeState(JSON.parse(result));
    } catch {
      return normalizeState();
    }
  }

  const record = memoryStore.get(key);
  if (!record) return normalizeState();
  if (record.expiresAt && record.expiresAt <= Date.now()) {
    memoryStore.delete(key);
    return normalizeState();
  }
  return normalizeState(record.value);
};

export const setState = async (contactId, state) => {
  if (!contactId) return;
  const key = getKey(contactId);
  const ttlSeconds = getTtlSeconds();
  const nextState = normalizeState({
    ...state,
    updated_at: new Date().toISOString(),
  });

  if (hasUpstash()) {
    await upstashFetch(['SET', key, JSON.stringify(nextState), 'EX', ttlSeconds]);
    return;
  }

  memoryStore.set(key, {
    value: nextState,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
};

export const updateState = async (contactId, updater) => {
  const current = await getState(contactId);
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...updater };
  await setState(contactId, next);
  return next;
};