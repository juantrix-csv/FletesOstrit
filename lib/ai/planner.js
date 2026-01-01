import { createOpenAIClient } from './openaiClient.js';
import { DEFAULT_KNOWN, DEFAULT_STATE } from './types.js';
import {
  buildSchedulePayload,
  computeMissingFields,
  extractDateTimeFromText,
  extractSlotSelection,
  parseHelpersFromText,
} from './utils.js';

const normalizeState = (state = {}) => {
  return {
    ...DEFAULT_STATE,
    ...state,
    known: { ...DEFAULT_KNOWN, ...(state.known ?? {}) },
    last_offer_slots: Array.isArray(state.last_offer_slots) ? state.last_offer_slots : [],
    history: Array.isArray(state.history) ? state.history : [],
  };
};

const getIntentFromText = (message) => {
  const text = String(message || '').toLowerCase();
  if (/(cancel|cancela|baja)/.test(text)) return 'cancel';
  if (/(reprogram|cambia|mover)/.test(text)) return 'reschedule';
  if (/(precio|cuanto|cotiz)/.test(text)) return 'quote';
  if (text.trim() === '') return 'unknown';
  return 'schedule';
};

const ruleBasedPlan = ({ message, state }) => {
  const nextState = normalizeState(state);
  const intent = getIntentFromText(message);

  const helperValue = parseHelpersFromText(message);
  if (helperValue != null && nextState.known.helpers == null) {
    nextState.known.helpers = helperValue;
  }

  const dateTime = extractDateTimeFromText(message);
  if (dateTime.date_pref && !nextState.known.date_pref) {
    nextState.known.date_pref = dateTime.date_pref;
  }
  if (dateTime.time_pref && !nextState.known.time_pref) {
    nextState.known.time_pref = dateTime.time_pref;
  }

  const selectedSlot = extractSlotSelection(message, nextState.last_offer_slots);
  const missing = computeMissingFields(nextState.known);

  if (missing.length > 0) {
    return {
      intent,
      draft_type: 'ASK_FIELD',
      missing_field: missing[0],
      tool_calls: [],
      facts: { ...nextState.known },
    };
  }

  if (selectedSlot) {
    return {
      intent,
      draft_type: 'FINAL_CONFIRM',
      tool_calls: [
        {
          tool_name: 'schedule_job',
          request: buildSchedulePayload(nextState.known, selectedSlot),
        },
      ],
      facts: { ...nextState.known, selected_slot: selectedSlot },
    };
  }

  if (nextState.last_offer_slots.length > 0) {
    return {
      intent,
      draft_type: 'OFFER_SLOTS',
      tool_calls: [],
      facts: { ...nextState.known, slots: nextState.last_offer_slots },
    };
  }

  if (nextState.known.date_pref && nextState.known.time_pref) {
    return {
      intent,
      draft_type: 'OFFER_SLOTS',
      tool_calls: [
        {
          tool_name: 'get_availability',
          request: {
            pickup: nextState.known.pickup,
            dropoff: nextState.known.dropoff,
            date: nextState.known.date_pref,
            time: nextState.known.time_pref,
          },
        },
      ],
      facts: { ...nextState.known },
    };
  }

  return {
    intent,
    draft_type: 'INFO',
    tool_calls: [],
    facts: { ...nextState.known },
  };
};

const buildPlannerPrompt = ({ message, state, history, toolsAvailable }) => {
  return [
    {
      role: 'system',
      content: [
        'You are the PLANNER. Output ONLY valid JSON. No markdown, no extra text.',
        'Schema:',
        '{',
        '  "intent": "quote|schedule|reschedule|cancel|info|unknown",',
        '  "draft_type": "ASK_FIELD|OFFER_SLOTS|FINAL_CONFIRM|INFO|APOLOGY",',
        '  "missing_field": "pickup|dropoff|items|datetime|helpers|other",',
        '  "tool_calls": [{"tool_name":"get_availability|schedule_job|estimate_job","request":{}}],',
        '  "facts": {},',
        '  "safety_notes": ""',
        '}',
        'Rules:',
        '- Ask only one missing field at a time, in this order: pickup, dropoff, items, datetime, helpers.',
        '- If any required field is missing, set draft_type=ASK_FIELD and missing_field accordingly.',
        '- Use tool_calls only if tools_available says it is true.',
        '- Never invent availability or prices. If missing, ask for info.',
        '- facts must include known values (pickup, dropoff, items, date_pref, time_pref, helpers, slots).',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({ message, state, history, tools_available: toolsAvailable }),
    },
  ];
};

const extractJson = (raw) => {
  if (!raw) return null;
  const text = String(raw).trim();
  if (text.startsWith('{') && text.endsWith('}')) return text;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
};

const parsePlannerResponse = (raw) => {
  const jsonText = extractJson(raw);
  if (!jsonText) throw new Error('Planner returned invalid JSON');
  const parsed = JSON.parse(jsonText);
  return {
    intent: parsed.intent ?? 'unknown',
    draft_type: parsed.draft_type ?? 'INFO',
    missing_field: parsed.missing_field ?? null,
    tool_calls: Array.isArray(parsed.tool_calls) ? parsed.tool_calls : [],
    facts: parsed.facts ?? {},
    safety_notes: parsed.safety_notes ?? undefined,
  };
};

export const planMessage = async (input, options = {}) => {
  const mode = options.mode ?? process.env.AI_PLANNER_MODE ?? 'openai';
  if (mode === 'rules' || !process.env.OPENAI_API_KEY) {
    return ruleBasedPlan(input);
  }

  const toolsAvailable = {
    get_availability: Boolean(process.env.AVAILABILITY_PATH),
    schedule_job: Boolean(process.env.SCHEDULE_JOB_PATH),
    estimate_job: Boolean(process.env.ESTIMATE_PATH),
  };

  const client = options.client ?? createOpenAIClient();
  const messages = buildPlannerPrompt({
    message: input.message,
    state: input.state ?? {},
    history: input.history ?? [],
    toolsAvailable,
  });

  const content = await client.chatCompletion({ messages, temperature: 0.2 });
  return parsePlannerResponse(content);
};

export const _internal = {
  ruleBasedPlan,
  normalizeState,
  parsePlannerResponse,
};
