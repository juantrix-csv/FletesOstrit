import { createOpenAIClient } from './openaiClient.js';
import { normalizeSlots } from './utils.js';

const templateAskField = (field) => {
  switch (field) {
    case 'pickup':
      return 'Dale. Desde que direccion o zona se retira?';
    case 'dropoff':
      return 'Joya. A que direccion o zona lo llevamos?';
    case 'items':
      return 'Perfecto. Que cosas son y mas o menos cuantas?';
    case 'datetime':
      return 'Listo. Para que dia y en que franja horaria?';
    case 'helpers':
      return 'Dale. Necesitas ayudante?';
    default:
      return 'Dale. Me pasas mas detalle?';
  }
};

const templateOfferSlots = (facts) => {
  const slots = normalizeSlots(facts?.slots ?? []);
  if (slots.length === 0) {
    return 'Ahora no tengo horarios para esa franja. Que dia y franja te quedan bien?';
  }
  const lines = ['Dale, tengo estos horarios:'];
  for (const slot of slots.slice(0, 2)) {
    lines.push(`- ${slot.label}`);
  }
  lines.push('Cual te va?');
  return lines.join('\n');
};

const templateFinalConfirm = (facts) => {
  const header = 'Listo. Entonces:';
  const pickup = facts?.pickup ? `Retiro: ${facts.pickup}` : null;
  const dropoff = facts?.dropoff ? `Entrega: ${facts.dropoff}` : null;
  const items = facts?.items ? `Carga: ${facts.items}` : null;
  const schedule = facts?.selected_slot?.label
    ? `Horario: ${facts.selected_slot.label}`
    : facts?.date_pref || facts?.time_pref
      ? `Horario: ${[facts?.date_pref ?? '', facts?.time_pref ?? ''].filter(Boolean).join(' ')}`
      : null;

  const line2 = pickup && dropoff ? `${pickup} -> ${dropoff}` : pickup || dropoff;
  const line3 = [items, schedule].filter(Boolean).join(' | ');
  const lines = [header, line2, line3, 'Confirmo y lo dejo agendado?'].filter(Boolean);
  return lines.join('\n');
};

const templateInfo = () => 'Listo. Ya lo reviso.';

const templateApology = () => 'Perdon, tuve un problema para revisar la agenda. Que dia y franja te quedan bien?';

const buildWriterPrompt = (draft) => [
  {
    role: 'system',
    content: [
      'You are the WRITER. Output ONLY reply_text, no JSON, no markdown.',
      'Persona: Sofia, secretaria virtual de Juan (Fletes Ostrit).',
      'Style rules:',
      '- Spanish (Argentina), voseo, informal-professional.',
      '- No emojis.',
      '- Short messages: 1 to 4 lines.',
      '- At most one question per message (except final confirmation summaries).',
      '- No technical language.',
      '- Use muletillas lightly: Dale, Joya, De una, Perfecto, Listo.',
      '- Do not use \"usted\".',
      '- Keep it direct and clear.',
    ].join('\n'),
  },
  {
    role: 'user',
    content: JSON.stringify(draft),
  },
];

export const writeReply = async (draft, options = {}) => {
  const mode = options.mode ?? process.env.AI_WRITER_MODE ?? 'openai';
  if (mode === 'templates' || !process.env.OPENAI_API_KEY) {
    switch (draft?.draft_type) {
      case 'ASK_FIELD':
        return templateAskField(draft?.missing_field);
      case 'OFFER_SLOTS':
        return templateOfferSlots(draft?.facts ?? {});
      case 'FINAL_CONFIRM':
        return templateFinalConfirm(draft?.facts ?? {});
      case 'APOLOGY':
        return templateApology();
      case 'INFO':
      default:
        return templateInfo();
    }
  }

  const client = options.client ?? createOpenAIClient();
  const messages = buildWriterPrompt(draft ?? {});
  const content = await client.chatCompletion({ messages, temperature: 0.3 });
  return String(content).trim();
};
