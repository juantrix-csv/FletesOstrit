import { useEffect, useMemo, useRef, useState } from 'react';
import {
  getCachedQueryEntry,
  refreshCachedQuery,
  subscribeCachedQuery,
} from '../lib/queryCache';

type UseCachedQueryOptions<T> = {
  key: string;
  enabled?: boolean;
  loader: () => Promise<T>;
  persist?: boolean;
  staleMs?: number;
  refreshIntervalMs?: number | null;
  revalidateOnFocus?: boolean;
  onError?: (error: unknown) => void;
};

export const useCachedQuery = <T>({
  key,
  enabled = true,
  loader,
  persist = true,
  staleMs = 30000,
  refreshIntervalMs = null,
  revalidateOnFocus = true,
  onError,
}: UseCachedQueryOptions<T>) => {
  const initialEntry = useMemo(() => (enabled ? getCachedQueryEntry<T>(key) : null), [enabled, key]);
  const [data, setData] = useState<T | null>(() => initialEntry?.data ?? null);
  const [loading, setLoading] = useState(() => enabled && !initialEntry);
  const [refreshing, setRefreshing] = useState(false);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const entry = getCachedQueryEntry<T>(key);
    setData(entry?.data ?? null);
    setLoading(!entry);
  }, [enabled, key]);

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeCachedQuery(key, () => {
      const entry = getCachedQueryEntry<T>(key);
      setData(entry?.data ?? null);
      setLoading(false);
      setRefreshing(false);
    });
  }, [enabled, key]);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    const refresh = async (silent: boolean) => {
      if (!silent) setLoading((current) => current || data == null);
      setRefreshing(true);
      try {
        await refreshCachedQuery(key, () => loaderRef.current(), persist);
      } catch (error) {
        onError?.(error);
      } finally {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      }
    };

    const entry = getCachedQueryEntry<T>(key);
    const isStale = !entry || Date.now() - entry.updatedAt > staleMs;
    if (isStale) {
      void refresh(Boolean(entry));
    }

    let intervalId: number | null = null;
    if (refreshIntervalMs != null && refreshIntervalMs > 0) {
      intervalId = window.setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        void refresh(true);
      }, refreshIntervalMs);
    }

    const handleVisibility = () => {
      if (!revalidateOnFocus || document.visibilityState !== 'visible') return;
      const current = getCachedQueryEntry<T>(key);
      const visibleStale = !current || Date.now() - current.updatedAt > staleMs;
      if (visibleStale) {
        void refresh(true);
      }
    };

    if (revalidateOnFocus) {
      document.addEventListener('visibilitychange', handleVisibility);
    }

    return () => {
      cancelled = true;
      if (intervalId != null) window.clearInterval(intervalId);
      if (revalidateOnFocus) {
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, [data, enabled, key, persist, refreshIntervalMs, revalidateOnFocus, staleMs]);

  const reload = async () => {
    if (!enabled) return null;
    setRefreshing(true);
    try {
      return await refreshCachedQuery(key, () => loaderRef.current(), persist);
    } catch (error) {
      onError?.(error);
      return null;
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  return {
    data,
    loading,
    refreshing,
    reload,
    updatedAt: getCachedQueryEntry<T>(key)?.updatedAt ?? null,
  };
};
