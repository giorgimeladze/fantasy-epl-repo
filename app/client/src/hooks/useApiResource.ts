import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { UnauthorizedError } from '../api.ts';

interface ApiResource<T> {
  data: T | null;
  error: string | null;
  /** True while loading, reloading or running a mutation. */
  loading: boolean;
  /** Reload; `forceRefresh` asks the server to skip its cache. */
  reload: (forceRefresh?: boolean) => Promise<void>;
  /** Runs a call that returns the new data (e.g. a save). On failure the previous data stays, with `error` set. */
  mutate: (call: () => Promise<T>) => Promise<void>;
}

/** Loads once on mount (the server cache is fine), and on `reload`; a 401 ends the session. */
export function useApiResource<T>(
  fetcher: (forceRefresh: boolean) => Promise<T>,
  onUnauthorized: () => void,
): ApiResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // The latest callbacks, so callers can pass inline functions without reloading on every render.
  const latest = useRef({ fetcher, onUnauthorized });
  useLayoutEffect(() => {
    latest.current = { fetcher, onUnauthorized };
  });

  const mutate = useCallback(async (call: () => Promise<T>) => {
    setLoading(true);
    setError(null);
    try {
      setData(await call());
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        latest.current.onUnauthorized();
        return;
      }
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(
    (forceRefresh = false) => mutate(() => latest.current.fetcher(forceRefresh)),
    [mutate],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, error, loading, reload, mutate };
}
