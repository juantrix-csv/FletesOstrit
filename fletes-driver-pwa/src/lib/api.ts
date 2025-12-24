import type { Job } from './types';

const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';

const fetchJson = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
};

export const listJobs = () => fetchJson<Job[]>('/jobs');
export const getJob = (id: string) => fetchJson<Job>(`/jobs/${id}`);
export const createJob = (job: Job) => fetchJson<Job>('/jobs', { method: 'POST', body: JSON.stringify(job) });
export const updateJob = (id: string, patch: Partial<Job>) =>
  fetchJson<Job>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteJob = async (id: string) => {
  const res = await fetch(`${API_BASE}/jobs/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
};
