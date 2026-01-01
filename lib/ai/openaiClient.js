const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o-mini';

export const createOpenAIClient = (opts = {}) => {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY;
  const baseUrl = (opts.baseUrl ?? process.env.OPENAI_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const model = opts.model ?? process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
  const timeoutSeconds = Number(opts.timeoutSeconds ?? process.env.OPENAI_TIMEOUT_SECONDS ?? 30);

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }

  const timeoutMs = Math.max(1000, timeoutSeconds * 1000);

  const chatCompletion = async ({ messages, temperature = 0.2 }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model, messages, temperature }),
        signal: controller.signal,
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = payload?.error?.message ?? response.statusText;
        throw new Error(`OpenAI error: ${response.status} ${detail}`);
      }

      const content = payload?.choices?.[0]?.message?.content;
      if (!content) throw new Error('OpenAI returned empty response');
      return String(content);
    } finally {
      clearTimeout(timer);
    }
  };

  return { chatCompletion };
};