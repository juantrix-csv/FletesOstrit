const ensureSlash = (value) => {
  if (!value) return '';
  return value.startsWith('/') ? value : `/${value}`;
};

const resolveUrl = (baseUrl, path) => {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (!baseUrl) return path;
  return `${baseUrl.replace(/\/$/, '')}${ensureSlash(path)}`;
};

export class ToolsClient {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl ?? process.env.MAIN_API_BASE_URL ?? '';
    this.apiKey = opts.apiKey ?? process.env.MAIN_API_KEY ?? '';
    this.availabilityPath = opts.availabilityPath ?? process.env.AVAILABILITY_PATH ?? '';
    this.schedulePath = opts.schedulePath ?? process.env.SCHEDULE_JOB_PATH ?? '';
    this.estimatePath = opts.estimatePath ?? process.env.ESTIMATE_PATH ?? '';
  }

  headers() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
      headers['x-api-key'] = this.apiKey;
    }
    return headers;
  }

  async request(path, payload) {
    const url = resolveUrl(this.baseUrl, path);
    if (!url) throw new Error('Missing tool path');
    const response = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(payload ?? {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data?.error ?? data?.message ?? response.statusText;
      throw new Error(`Tool error: ${response.status} ${detail}`);
    }
    return data;
  }

  async get_availability(payload) {
    return this.request(this.availabilityPath, payload);
  }

  async schedule_job(payload) {
    return this.request(this.schedulePath, payload);
  }

  async estimate_job(payload) {
    if (!this.estimatePath) throw new Error('ESTIMATE_PATH not configured');
    return this.request(this.estimatePath, payload);
  }
}