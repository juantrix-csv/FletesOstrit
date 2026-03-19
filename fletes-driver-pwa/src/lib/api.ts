import type { Driver, DriverLocation, Job, Vehicle } from './types';
import { invalidateCachedQueries, updateMatchingCachedQueries } from './queryCache';

const API_BASE = import.meta.env.VITE_API_BASE || '/api/v1';

type ApiActivitySnapshot = {
  pendingRequests: number;
  pendingMutations: number;
};

type RequestMeta = {
  blockUi?: boolean;
};

const activityListeners = new Set<() => void>();
const inflightMutations = new Map<string, Promise<unknown>>();
let activitySnapshot: ApiActivitySnapshot = {
  pendingRequests: 0,
  pendingMutations: 0,
};

const notifyActivity = () => {
  activityListeners.forEach((listener) => listener());
};

const updateActivity = (delta: 1 | -1, trackBlockingMutation: boolean) => {
  activitySnapshot = {
    pendingRequests: Math.max(0, activitySnapshot.pendingRequests + delta),
    pendingMutations: Math.max(0, activitySnapshot.pendingMutations + (trackBlockingMutation ? delta : 0)),
  };
  notifyActivity();
};

const toMutationKey = (path: string, options?: RequestInit) => {
  const method = (options?.method ?? 'GET').toUpperCase();
  return `${method}:${path}:${options?.body ?? ''}`;
};

const runRequest = async <T>(path: string, options?: RequestInit, meta?: RequestMeta): Promise<T> => {
  const method = (options?.method ?? 'GET').toUpperCase();
  const isMutation = method !== 'GET' && method !== 'HEAD';
  const trackBlockingMutation = isMutation && meta?.blockUi !== false;
  const mutationKey = isMutation ? toMutationKey(path, options) : null;
  if (mutationKey) {
    const existing = inflightMutations.get(mutationKey) as Promise<T> | undefined;
    if (existing) return existing;
  }

  const request = (async () => {
    updateActivity(1, trackBlockingMutation);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }
      if (res.status === 204) {
        return undefined as T;
      }
      return res.json() as Promise<T>;
    } finally {
      updateActivity(-1, trackBlockingMutation);
      if (mutationKey) {
        inflightMutations.delete(mutationKey);
      }
    }
  })();

  if (mutationKey) {
    inflightMutations.set(mutationKey, request);
  }

  return request;
};

const fetchJson = async <T>(path: string, options?: RequestInit, meta?: RequestMeta): Promise<T> => runRequest<T>(path, options, meta);

const fetchBlob = async (path: string, options?: RequestInit, meta?: RequestMeta) => {
  const method = (options?.method ?? 'GET').toUpperCase();
  const isMutation = method !== 'GET' && method !== 'HEAD';
  const trackBlockingMutation = isMutation && meta?.blockUi !== false;
  updateActivity(1, trackBlockingMutation);
  try {
    const res = await fetch(`${API_BASE}${path}`, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.blob();
  } finally {
    updateActivity(-1, trackBlockingMutation);
  }
};

const toQueryString = (opts?: { driverId?: string; driverCode?: string }) => {
  const params = new URLSearchParams();
  if (opts?.driverId) params.set('driverId', opts.driverId);
  if (opts?.driverCode) params.set('driverCode', opts.driverCode);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

const patchJobInList = (jobs: Job[], updatedJob: Job, cacheKey: string) => {
  const queryString = cacheKey.includes('?') ? cacheKey.slice(cacheKey.indexOf('?') + 1) : '';
  const params = new URLSearchParams(queryString);
  const driverId = params.get('driverId');
  const driverCode = params.get('driverCode');
  if (driverCode) {
    return jobs;
  }

  const shouldInclude = !driverId || updatedJob.driverId === driverId;
  const withoutJob = jobs.filter((job) => job.id !== updatedJob.id);
  if (!shouldInclude) return withoutJob;
  const previousIndex = jobs.findIndex((job) => job.id === updatedJob.id);
  if (previousIndex === -1) return [updatedJob, ...withoutJob];
  const next = [...withoutJob];
  next.splice(previousIndex, 0, updatedJob);
  return next;
};

const removeJobFromList = (jobs: Job[], removedJobId: string) => jobs.filter((job) => job.id !== removedJobId);

const invalidateJobHistoryDownload = () => {
  invalidateCachedQueries((key) => key.startsWith('jobs-history:'));
};

const syncUpdatedJobCaches = (job: Job) => {
  updateMatchingCachedQueries<Job[]>(
    (key) => key.startsWith('jobs:list'),
    (jobs, cacheKey) => patchJobInList(jobs, job, cacheKey),
  );
  updateMatchingCachedQueries<Job>(
    (key) => key === `job:detail:${job.id}` || key.startsWith(`job:detail:${job.id}?`),
    () => job,
  );
  invalidateJobHistoryDownload();
};

const syncDeletedJobCaches = (jobId: string) => {
  updateMatchingCachedQueries<Job[]>(
    (key) => key.startsWith('jobs:list'),
    (jobs) => removeJobFromList(jobs, jobId),
  );
  invalidateCachedQueries((key) => key === `job:detail:${jobId}` || key.startsWith(`job:detail:${jobId}?`));
  invalidateJobHistoryDownload();
};

const invalidateDriverCaches = () => {
  invalidateCachedQueries((key) => key.startsWith('drivers:list'));
};

const invalidateVehicleCaches = () => {
  invalidateCachedQueries((key) => key.startsWith('vehicles:list'));
};

const patchLocationInList = (locations: DriverLocation[], updatedLocation: DriverLocation) => {
  const withoutCurrent = locations.filter((location) => location.driverId !== updatedLocation.driverId);
  return [updatedLocation, ...withoutCurrent].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
};

export const subscribeApiActivity = (listener: () => void) => {
  activityListeners.add(listener);
  return () => {
    activityListeners.delete(listener);
  };
};

export const getApiActivitySnapshot = () => activitySnapshot;

export const jobsListQueryKey = (opts?: { driverId?: string; driverCode?: string }) => `jobs:list${toQueryString(opts)}`;
export const jobDetailQueryKey = (id: string, opts?: { driverId?: string; driverCode?: string }) => `job:detail:${id}${toQueryString(opts)}`;
export const driversListQueryKey = () => 'drivers:list';
export const vehiclesListQueryKey = () => 'vehicles:list';
export const driverLocationsListQueryKey = () => 'driver-locations:list';

export const listJobs = (opts?: { driverId?: string; driverCode?: string }) => {
  const qs = toQueryString(opts);
  return fetchJson<Job[]>(`/jobs${qs}`);
};

export const getJob = (id: string, opts?: { driverId?: string; driverCode?: string }) => {
  const qs = toQueryString(opts);
  return fetchJson<Job>(`/jobs/${id}${qs}`);
};

export const createJob = async (job: Job) => {
  const created = await fetchJson<Job>('/jobs', { method: 'POST', body: JSON.stringify(job) });
  invalidateCachedQueries((key) => key.startsWith('jobs:list'));
  invalidateJobHistoryDownload();
  return created;
};

export const updateJob = async (id: string, patch: Partial<Job>) => {
  const updated = await fetchJson<Job>(`/jobs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  syncUpdatedJobCaches(updated);
  return updated;
};

export const deleteJob = async (id: string) => {
  await runRequest<void>(`/jobs/${id}`, { method: 'DELETE' });
  syncDeletedJobCaches(id);
};

export const listDrivers = () => fetchJson<Driver[]>('/drivers');

export const getDriverByCode = (code: string) => {
  const normalized = code.trim().toUpperCase();
  return fetchJson<Driver>(`/drivers?code=${encodeURIComponent(normalized)}`);
};

export const createDriver = async (driver: Driver) => {
  const created = await fetchJson<Driver>('/drivers', { method: 'POST', body: JSON.stringify(driver) });
  invalidateDriverCaches();
  return created;
};

export const updateDriver = async (id: string, patch: Partial<Driver>) => {
  const updated = await fetchJson<Driver>(`/drivers/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  invalidateDriverCaches();
  invalidateCachedQueries((key) => key.startsWith('jobs:list'));
  return updated;
};

export const deleteDriver = async (id: string) => {
  await runRequest<void>(`/drivers/${id}`, { method: 'DELETE' });
  invalidateDriverCaches();
  invalidateCachedQueries((key) => key.startsWith('jobs:list'));
};

export const listVehicles = () => fetchJson<Vehicle[]>('/vehicles');

export const createVehicle = async (vehicle: Vehicle) => {
  const created = await fetchJson<Vehicle>('/vehicles', { method: 'POST', body: JSON.stringify(vehicle) });
  invalidateVehicleCaches();
  return created;
};

export const updateVehicle = async (id: string, patch: Partial<Vehicle>) => {
  const updated = await fetchJson<Vehicle>(`/vehicles/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
  invalidateVehicleCaches();
  return updated;
};

export const deleteVehicle = async (id: string) => {
  await runRequest<void>(`/vehicles/${id}`, { method: 'DELETE' });
  invalidateVehicleCaches();
  invalidateDriverCaches();
};

export const listDriverLocations = () => fetchJson<DriverLocation[]>('/driver-locations');

export const updateDriverLocation = async (payload: Omit<DriverLocation, 'updatedAt'> & { driverCode?: string }) => {
  const updated = await fetchJson<DriverLocation>(
    '/driver-locations',
    { method: 'POST', body: JSON.stringify(payload) },
    { blockUi: false },
  );
  updateMatchingCachedQueries<DriverLocation[]>(
    (key) => key.startsWith('driver-locations:list'),
    (locations) => patchLocationInList(locations, updated),
  );
  return updated;
};

export const getHourlyRate = () => fetchJson<{ hourlyRate: number | null }>('/settings/hourly-rate');

export const setHourlyRate = (hourlyRate: number | null) =>
  fetchJson<{ hourlyRate: number | null }>('/settings/hourly-rate', {
    method: 'PUT',
    body: JSON.stringify({ hourlyRate }),
  });

export const getHelperHourlyRate = () => fetchJson<{ hourlyRate: number | null }>('/settings/helper-hourly-rate');

export const setHelperHourlyRate = (hourlyRate: number | null) =>
  fetchJson<{ hourlyRate: number | null }>('/settings/helper-hourly-rate', {
    method: 'PUT',
    body: JSON.stringify({ hourlyRate }),
  });

export const getOwnerVehicleDriverShare = () => fetchJson<{ value: number | null }>('/settings/owner-vehicle-driver-share');

export const setOwnerVehicleDriverShare = (value: number | null) =>
  fetchJson<{ value: number | null }>('/settings/owner-vehicle-driver-share', {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });

export const getDriverVehicleDriverShare = () => fetchJson<{ value: number | null }>('/settings/driver-vehicle-driver-share');

export const setDriverVehicleDriverShare = (value: number | null) =>
  fetchJson<{ value: number | null }>('/settings/driver-vehicle-driver-share', {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });

export const getFixedMonthlyCost = () => fetchJson<{ value: number | null }>('/settings/fixed-monthly-cost');

export const setFixedMonthlyCost = (value: number | null) =>
  fetchJson<{ value: number | null }>('/settings/fixed-monthly-cost', {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });

export const getTripCostPerHour = () => fetchJson<{ value: number | null }>('/settings/trip-cost-per-hour');

export const setTripCostPerHour = (value: number | null) =>
  fetchJson<{ value: number | null }>('/settings/trip-cost-per-hour', {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });

export const getTripCostPerKm = () => fetchJson<{ value: number | null }>('/settings/trip-cost-per-km');

export const setTripCostPerKm = (value: number | null) =>
  fetchJson<{ value: number | null }>('/settings/trip-cost-per-km', {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });

export const downloadJobsHistory = async () => {
  return fetchBlob('/jobs/history/export');
};
