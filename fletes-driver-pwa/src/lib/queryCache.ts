type CacheEntry<T> = {
  data: T;
  updatedAt: number;
};

type CacheListener = () => void;

const STORAGE_PREFIX = 'fo-cache:';
const cache = new Map<string, CacheEntry<unknown>>();
const listeners = new Map<string, Set<CacheListener>>();
const inflightRefresh = new Map<string, Promise<unknown>>();

const getStorageKey = (key: string) => `${STORAGE_PREFIX}${key}`;

const notify = (key: string) => {
  listeners.get(key)?.forEach((listener) => listener());
};

const loadPersistedEntry = <T>(key: string): CacheEntry<T> | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getStorageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T> | null;
    if (!parsed || typeof parsed !== 'object' || !('updatedAt' in parsed) || !('data' in parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const getCachedQueryEntry = <T>(key: string): CacheEntry<T> | null => {
  const inMemory = cache.get(key) as CacheEntry<T> | undefined;
  if (inMemory) return inMemory;
  const persisted = loadPersistedEntry<T>(key);
  if (persisted) {
    cache.set(key, persisted);
    return persisted;
  }
  return null;
};

export const setCachedQueryData = <T>(key: string, data: T, persist = true) => {
  const entry: CacheEntry<T> = {
    data,
    updatedAt: Date.now(),
  };
  cache.set(key, entry);
  if (persist && typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(getStorageKey(key), JSON.stringify(entry));
    } catch {
      // Ignore storage failures and keep the in-memory cache.
    }
  }
  notify(key);
  return entry;
};

export const updateCachedQueryData = <T>(key: string, updater: (current: T | null) => T | null, persist = true) => {
  const current = getCachedQueryEntry<T>(key)?.data ?? null;
  const next = updater(current);
  if (next == null) {
    invalidateCachedQueries((candidate) => candidate === key);
    return null;
  }
  return setCachedQueryData(key, next, persist);
};

export const updateMatchingCachedQueries = <T>(
  predicate: (key: string) => boolean,
  updater: (current: T, key: string) => T,
  persist = true,
) => {
  const keys = new Set<string>();
  cache.forEach((_, key) => {
    if (predicate(key)) keys.add(key);
  });
  if (typeof window !== 'undefined') {
    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const storageKey = window.localStorage.key(index);
        if (!storageKey || !storageKey.startsWith(STORAGE_PREFIX)) continue;
        const key = storageKey.slice(STORAGE_PREFIX.length);
        if (predicate(key)) keys.add(key);
      }
    } catch {
      // Ignore storage iteration issues.
    }
  }

  keys.forEach((key) => {
    const current = getCachedQueryEntry<T>(key);
    if (!current) return;
    setCachedQueryData(key, updater(current.data, key), persist);
  });
};

export const invalidateCachedQueries = (predicate: (key: string) => boolean) => {
  const keys = new Set<string>();
  cache.forEach((_, key) => {
    if (predicate(key)) keys.add(key);
  });
  if (typeof window !== 'undefined') {
    try {
      const keysToDelete: string[] = [];
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const storageKey = window.localStorage.key(index);
        if (!storageKey || !storageKey.startsWith(STORAGE_PREFIX)) continue;
        const key = storageKey.slice(STORAGE_PREFIX.length);
        if (predicate(key)) {
          keys.add(key);
          keysToDelete.push(storageKey);
        }
      }
      keysToDelete.forEach((storageKey) => window.localStorage.removeItem(storageKey));
    } catch {
      // Ignore storage failures.
    }
  }

  keys.forEach((key) => {
    cache.delete(key);
    notify(key);
  });
};

export const subscribeCachedQuery = (key: string, listener: CacheListener) => {
  const current = listeners.get(key) ?? new Set<CacheListener>();
  current.add(listener);
  listeners.set(key, current);
  return () => {
    const next = listeners.get(key);
    if (!next) return;
    next.delete(listener);
    if (next.size === 0) listeners.delete(key);
  };
};

export const refreshCachedQuery = async <T>(
  key: string,
  loader: () => Promise<T>,
  persist = true,
) => {
  const existing = inflightRefresh.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const request = loader()
    .then((data) => {
      setCachedQueryData(key, data, persist);
      return data;
    })
    .finally(() => {
      inflightRefresh.delete(key);
    });

  inflightRefresh.set(key, request);
  return request;
};
