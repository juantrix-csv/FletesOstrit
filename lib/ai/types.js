/**
 * @typedef {Object} DraftReply
 * @property {'quote'|'schedule'|'reschedule'|'cancel'|'info'|'unknown'} intent
 * @property {'ASK_FIELD'|'OFFER_SLOTS'|'FINAL_CONFIRM'|'INFO'|'APOLOGY'} draft_type
 * @property {'pickup'|'dropoff'|'items'|'datetime'|'helpers'|'other'|null} [missing_field]
 * @property {Array<{tool_name:string,request:Object}>} tool_calls
 * @property {Object} facts
 * @property {string} [safety_notes]
 */

/**
 * @typedef {Object} Action
 * @property {'TOOL_CALL'|'NEEDS_FIELD'|'NOTE'} type
 * @property {string} [tool_name]
 * @property {Object} [request]
 * @property {'success'|'error'} [status]
 * @property {string} [error]
 * @property {string} [field]
 * @property {string} [message]
 */

/**
 * @typedef {Object} AiState
 * @property {Object} known
 * @property {string[]} missing_fields
 * @property {Array<Object>} last_offer_slots
 * @property {Object|null} pending_confirmation
 * @property {string|null} last_intent
 * @property {string|null} updated_at
 * @property {Array<{role:string,content:string}>} history
 */

export const INTENTS = ['quote', 'schedule', 'reschedule', 'cancel', 'info', 'unknown'];
export const DRAFT_TYPES = ['ASK_FIELD', 'OFFER_SLOTS', 'FINAL_CONFIRM', 'INFO', 'APOLOGY'];
export const REQUIRED_FIELDS_ORDER = ['pickup', 'dropoff', 'items', 'datetime', 'helpers'];

export const DEFAULT_KNOWN = {
  pickup: null,
  dropoff: null,
  items: null,
  date_pref: null,
  time_pref: null,
  helpers: null,
  floors: null,
  elevator: null,
  notes: null,
};

export const DEFAULT_STATE = {
  known: { ...DEFAULT_KNOWN },
  missing_fields: [],
  last_offer_slots: [],
  pending_confirmation: null,
  last_intent: null,
  updated_at: null,
  history: [],
};
