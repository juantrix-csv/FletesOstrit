import { planMessage } from './planner.js';
import { writeReply } from './writer.js';
import { ToolsClient } from './toolsClient.js';
import { getState, setState } from './state.js';
import { computeMissingFields, normalizeSlots } from './utils.js';

const resolveContactId = (payload = {}) =>
  payload.contact_id ?? payload.contactId ?? payload.thread_id ?? payload.threadId ?? payload.from ?? payload.sender ?? 'unknown';

const appendHistory = (history, role, content) => {
  const next = Array.isArray(history) ? [...history] : [];
  if (content) next.push({ role, content });
  return next.slice(-10);
};

const applyFactsToKnown = (known, facts) => {
  const next = { ...known };
  const fields = ['pickup', 'dropoff', 'items', 'date_pref', 'time_pref', 'helpers', 'floors', 'elevator', 'notes'];
  for (const field of fields) {
    if (facts?.[field] != null) {
      next[field] = facts[field];
    }
  }
  return next;
};

const applyToolResults = (draft, toolName, result) => {
  const nextDraft = { ...draft, facts: { ...(draft.facts ?? {}) } };
  if (toolName === 'get_availability') {
    const slots = normalizeSlots(result?.slots ?? result?.availability ?? result?.data ?? []);
    nextDraft.facts.slots = slots;
    if (slots.length > 0) {
      nextDraft.draft_type = 'OFFER_SLOTS';
    }
  }
  if (toolName === 'estimate_job') {
    nextDraft.facts.estimate = result;
  }
  if (toolName === 'schedule_job') {
    nextDraft.facts.scheduled_job = result;
  }
  return nextDraft;
};

export const handleIncomingMessage = async (payload = {}) => {
  const message = String(payload.message ?? payload.text ?? payload.body ?? '').trim();
  if (!message) {
    throw new Error('Missing message');
  }

  const contactId = resolveContactId(payload);
  const state = await getState(contactId);
  const history = state.history ?? [];

  let draft;
  const actions = [];
  try {
    draft = await planMessage({ message, state, history });
  } catch (error) {
    actions.push({ type: 'NOTE', message: 'planner_failed' });
    draft = { intent: 'unknown', draft_type: 'APOLOGY', tool_calls: [], facts: {} };
  }

  if (draft?.missing_field) {
    actions.push({ type: 'NEEDS_FIELD', field: draft.missing_field });
  }

  const toolsClient = new ToolsClient();
  const toolCalls = Array.isArray(draft?.tool_calls) ? draft.tool_calls : [];

  for (const toolCall of toolCalls) {
    const toolName = toolCall?.tool_name;
    if (!toolName || typeof toolsClient[toolName] !== 'function') {
      actions.push({ type: 'TOOL_CALL', tool_name: toolName ?? 'unknown', request: toolCall?.request, status: 'error', error: 'Unknown tool' });
      draft = { ...draft, draft_type: 'APOLOGY' };
      continue;
    }

    try {
      const result = await toolsClient[toolName](toolCall?.request ?? {});
      actions.push({ type: 'TOOL_CALL', tool_name: toolName, request: toolCall?.request ?? {}, status: 'success' });
      draft = applyToolResults(draft, toolName, result);
    } catch (error) {
      actions.push({
        type: 'TOOL_CALL',
        tool_name: toolName,
        request: toolCall?.request ?? {},
        status: 'error',
        error: error?.message ?? 'Tool error',
      });
      actions.push({ type: 'NOTE', message: 'tool_call_failed' });
      draft = { ...draft, draft_type: 'APOLOGY' };
    }
  }

  let replyText;
  try {
    replyText = await writeReply(draft);
  } catch (error) {
    actions.push({ type: 'NOTE', message: 'writer_failed' });
    replyText = await writeReply(draft, { mode: 'templates' });
  }

  const nextKnown = applyFactsToKnown(state.known ?? {}, draft?.facts ?? {});
  const missingFields = computeMissingFields(nextKnown);
  const nextState = {
    ...state,
    known: nextKnown,
    missing_fields: missingFields,
    last_intent: draft?.intent ?? state.last_intent,
    last_offer_slots: normalizeSlots(draft?.facts?.slots ?? state.last_offer_slots),
    history: appendHistory(appendHistory(history, 'user', message), 'assistant', replyText),
  };

  if (draft?.facts?.selected_slot) {
    nextState.pending_confirmation = {
      slot_id: draft.facts.selected_slot?.id ?? null,
      job_temp: draft.facts.scheduled_job ?? null,
    };
  }

  if (draft?.draft_type === 'INFO' && /confirmo|ok|dale|listo/i.test(message)) {
    nextState.pending_confirmation = null;
  }

  await setState(contactId, nextState);

  return { reply_text: replyText, actions, state: nextState };
};
