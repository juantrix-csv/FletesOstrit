import test from 'node:test';
import assert from 'node:assert/strict';
import { writeReply } from '../lib/ai/writer.js';
import { countQuestions, containsEmoji } from '../lib/ai/utils.js';

process.env.AI_WRITER_MODE = 'templates';

const baseDraft = {
  intent: 'schedule',
  draft_type: 'ASK_FIELD',
  missing_field: 'pickup',
  tool_calls: [],
  facts: {},
};

const assertStyle = (text) => {
  assert.equal(containsEmoji(text), false, 'no emojis');
  assert.ok(countQuestions(text) <= 1, 'max one question');
  const lines = text.split('\n');
  assert.ok(lines.length <= 4, 'short message');
};

test('writer asks for pickup with short message', async () => {
  const reply = await writeReply(baseDraft);
  assertStyle(reply);
});

test('writer offers slots without extra questions', async () => {
  const reply = await writeReply({
    intent: 'schedule',
    draft_type: 'OFFER_SLOTS',
    tool_calls: [],
    facts: { slots: ['Vie 18:00', 'Vie 19:30', 'Sab 10:00'] },
  });
  assertStyle(reply);
});

test('writer confirms with summary', async () => {
  const reply = await writeReply({
    intent: 'schedule',
    draft_type: 'FINAL_CONFIRM',
    tool_calls: [],
    facts: {
      pickup: 'La Plata',
      dropoff: 'Berisso',
      items: 'Sillon y cajas',
      selected_slot: { label: 'Vie 18:00' },
    },
  });
  assertStyle(reply);
});