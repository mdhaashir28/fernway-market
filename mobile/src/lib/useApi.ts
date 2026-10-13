import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/context/AuthContext';

interface Options {
  /** Skip loading (e.g. until the user logs in). */
  enabled?: boolean;
  /** Load again every time this screen comes back into view. */
  refetchOnFocus?: boolean;
  /** Keep refreshing every N milliseconds while the screen is open. */
  pollMs?: number;
}

/**
 * Loads data for a screen and tracks loading / error / refreshing states.
 *   const { data, error, loading, refreshing, refresh } = useApi(() => api.get(...), [deps])
 */
export function useApi<T>(load: () => Promise<T>, deps: unknown[], options: Options = {}) {
  const { refetchOnFocus = false, pollMs } = options;
  // Wait until the saved login has been restored, so requests carry the token.
  const { restoring } = useAuth();
  const wanted = options.enabled ?? true;
  const enabled = wanted && !restoring;
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(wanted);
  const [refreshing, setRefreshing] = useState(false);
  const loadRef = useRef(load);
  const requestId = useRef(0);

  useEffect(() => {
    loadRef.current = load;
  });

  const run = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      if (!enabled) return;
      const id = ++requestId.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'refresh') setRefreshing(true);
      try {
        const result = await loadRef.current();
        if (id === requestId.current) {
          setData(result);
          setError(undefined);
        }
      } catch (err) {
        if (id === requestId.current) setError(err as Error);
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) {
      if (!restoring) setLoading(false); // still restoring the login → keep showing "loading"
      return;
    }
    run('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      if (refetchOnFocus) run('silent');
    }, [refetchOnFocus, run]),
  );

  useEffect(() => {
    if (!pollMs || !enabled) return;
    const timer = setInterval(() => run('silent'), pollMs);
    return () => clearInterval(timer);
  }, [pollMs, enabled, run]);

  return {
    data,
    error,
    loading,
    refreshing,
    refresh: () => run('refresh'),
    reload: () => run('initial'),
    setData,
  };
}

/** Returns `value` only after it stops changing for `delayMs`. */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
