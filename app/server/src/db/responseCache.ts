// SQLite cache for assembled API responses (key → JSON), used by every data endpoint.
import type { CacheInfo } from '../team/models.js';
import { getDatabase } from './database.js';

function cacheInfo(fromCache: boolean, fetchedAt: number, ttl: number): CacheInfo {
  return {
    fromCache,
    fetchedAt: new Date(fetchedAt).toISOString(),
    expiresAt: new Date(fetchedAt + ttl).toISOString(),
  };
}

/** Serves `key` from the response cache for `ttl` ms, otherwise builds, stores and returns it. */
export async function cachedResponse<T extends object>(
  key: string,
  ttl: number,
  forceRefresh: boolean,
  build: () => Promise<T>,
): Promise<T & { cache: CacheInfo }> {
  const hit = forceRefresh ? null : responseCache.get<T>(key);
  if (hit && Date.now() - hit.fetchedAt < ttl) {
    return { ...hit.payload, cache: cacheInfo(true, hit.fetchedAt, ttl) };
  }

  const payload = await build();
  const fetchedAt = Date.now();
  responseCache.save(key, payload, fetchedAt);
  return { ...payload, cache: cacheInfo(false, fetchedAt, ttl) };
}

export const responseCache = {
  get<T>(key: string): { payload: T; fetchedAt: number } | null {
    const row = getDatabase()
      .prepare('SELECT payload, fetched_at FROM response_cache WHERE cache_key = ?')
      .get(key) as { payload: string; fetched_at: number } | undefined;
    if (!row) return null;
    return { payload: JSON.parse(row.payload) as T, fetchedAt: row.fetched_at };
  },

  save(key: string, payload: unknown, fetchedAt: number): void {
    getDatabase()
      .prepare(
        `INSERT INTO response_cache (cache_key, payload, fetched_at) VALUES (?, ?, ?)
         ON CONFLICT (cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
      )
      .run(key, JSON.stringify(payload), fetchedAt);
  },
};
