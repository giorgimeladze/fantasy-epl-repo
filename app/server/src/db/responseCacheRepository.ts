import type { DatabaseSync } from 'node:sqlite';
import { getDatabase } from './database.js';

export interface CachedResponse<T> {
  payload: T;
  fetchedAt: number; // epoch ms
}

/** Generic key → JSON cache for assembled API responses. */
export function createResponseCacheRepository(db: DatabaseSync) {
  return {
    get<T>(key: string): CachedResponse<T> | null {
      const row = db
        .prepare('SELECT payload, fetched_at FROM response_cache WHERE cache_key = ?')
        .get(key) as { payload: string; fetched_at: number } | undefined;
      if (!row) return null;
      return { payload: JSON.parse(row.payload) as T, fetchedAt: row.fetched_at };
    },

    save(key: string, payload: unknown, fetchedAt: number = Date.now()): void {
      db.prepare(
        `INSERT INTO response_cache (cache_key, payload, fetched_at) VALUES (?, ?, ?)
         ON CONFLICT (cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
      ).run(key, JSON.stringify(payload), fetchedAt);
    },

    clear(): void {
      db.exec('DELETE FROM response_cache');
    },
  };
}

export type ResponseCacheRepository = ReturnType<typeof createResponseCacheRepository>;

let instance: ResponseCacheRepository | null = null;

export function responseCacheRepository(): ResponseCacheRepository {
  instance ??= createResponseCacheRepository(getDatabase());
  return instance;
}
