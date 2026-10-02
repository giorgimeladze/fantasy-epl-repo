import { useCallback, useEffect, useState } from 'react';
import { UnauthorizedError } from '../api.ts';

interface ApiResource<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Reload; `forceRefresh` asks the server to skip its cache. */
  reload: (forceRefresh?: boolean) => Promise<void>;
}

/** Loads once on mount (server cache is fine); 401s end the session. */
export function useApiResource<T>(
  fetcher: (forceRefresh: boolean) => Promise<T>,
  onUnauthorized: () => void,
): ApiResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      setError(null);
      try {
        setData(await fetcher(forceRefresh));
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onUnauthorized();
          return;
        }
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [fetcher, onUnauthorized],
  );

  useEffect(() => {
    void reload();
    // Load once on mount only.
  }, []);

  return { data, error, loading, reload };
}
