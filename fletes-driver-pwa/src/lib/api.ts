import type { Driver, DriverLocation, Job } from './types';

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

export const listJobs = (opts?: { driverId?: string; driverCode?: string }) => {
  const params = new URLSearchParams();
  if (opts?.driverId) params.set('driverId', opts.driverId);
  if (opts?.driverCode) params.set('driverCode', opts.driverCode);
  const qs = params.toString();
  return fetchJson<Job[]>(`/jobs${qs ? `?${qs}` : ''}`);
};
export const getJob = (id: string, opts?: { driverId?: string; driverCode?: string }) => {
  const params = new URLSearchParams();
  if (opts?.driverId) params.set('driverId', opts.driverId);
  if (opts?.driverCode) params.set('driverCode', opts.driverCode);
  const qs = params.toString();
  return fetchJson<Job>(`/jobs/${id}${qs ? `?${qs}` : ''}`);
};
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

export const listDrivers = () => fetchJson<Driver[]>('/drivers');
export const getDriverByCode = (code: string) => {
  const normalized = code.trim().toUpperCase();
  return fetchJson<Driver>(`/drivers?code=${encodeURIComponent(normalized)}`);
};
export const createDriver = (driver: Driver) =>
  fetchJson<Driver>('/drivers', { method: 'POST', body: JSON.stringify(driver) });
export const updateDriver = (id: string, patch: Partial<Driver>) =>
  fetchJson<Driver>(`/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
export const deleteDriver = async (id: string) => {
  const res = await fetch(`${API_BASE}/drivers/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
};

export const listDriverLocations = () => fetchJson<DriverLocation[]>('/driver-locations');
export const updateDriverLocation = (payload: Omit<DriverLocation, 'updatedAt'> & { driverCode?: string }) =>
  fetchJson<DriverLocation>('/driver-locations', { method: 'POST', body: JSON.stringify(payload) });
