import test from 'node:test';
import assert from 'node:assert/strict';
import { planMessage } from '../lib/ai/planner.js';

process.env.AI_PLANNER_MODE = 'rules';

const baseState = {
  known: {
    pickup: null,
    dropoff: null,
    items: null,
    date_pref: null,
    time_pref: null,
    helpers: null,
  },
  last_offer_slots: [],
  history: [],
};

test('planner asks for pickup first', async () => {
  const draft = await planMessage({ message: 'Hola', state: baseState, history: [] });
  assert.equal(draft.draft_type, 'ASK_FIELD');
  assert.equal(draft.missing_field, 'pickup');
});

test('planner asks for dropoff after pickup', async () => {
  const state = {
    ...baseState,
    known: { ...baseState.known, pickup: 'La Plata' },
  };
  const draft = await planMessage({ message: 'Ok', state, history: [] });
  assert.equal(draft.draft_type, 'ASK_FIELD');
  assert.equal(draft.missing_field, 'dropoff');
});

test('planner offers slots when available', async () => {
  const state = {
    known: {
      pickup: 'La Plata',
      dropoff: 'Berisso',
      items: 'Cajas',
      date_pref: '2025-01-02',
      time_pref: '18:00',
      helpers: 0,
    },
    last_offer_slots: [{ id: '1', label: 'Vie 18:00' }, { id: '2', label: 'Vie 19:30' }],
    history: [],
  };
  const draft = await planMessage({ message: 'Dale', state, history: [] });
  assert.equal(draft.draft_type, 'OFFER_SLOTS');
  assert.ok(Array.isArray(draft.facts?.slots));
});

test('planner schedules when slot selected', async () => {
  const state = {
    known: {
      pickup: 'La Plata',
      dropoff: 'Berisso',
      items: 'Cajas',
      date_pref: '2025-01-02',
      time_pref: '18:00',
      helpers: 0,
    },
    last_offer_slots: [{ id: '1', label: 'Vie 18:00' }, { id: '2', label: 'Vie 19:30' }],
    history: [],
  };
  const draft = await planMessage({ message: '2', state, history: [] });
  assert.equal(draft.draft_type, 'FINAL_CONFIRM');
  assert.ok(draft.tool_calls?.some((call) => call.tool_name === 'schedule_job'));
});