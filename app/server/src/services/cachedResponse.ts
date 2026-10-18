import { responseCacheRepository } from '../db/responseCacheRepository.js';
import type { CacheInfo } from '../models/team.js';

export function cacheInfo(fromCache: boolean, fetchedAt: number, ttl: number): CacheInfo {
  return {
    fromCache,
    fetchedAt: new Date(fetchedAt).toISOString(),
    expiresAt: new Date(fetchedAt + ttl).toISOString(),
  };
}

/** Serves `key` from the SQLite response cache for `ttl`, otherwise builds and stores it. */
export async function cachedResponse<T extends object>(
  key: string,
  ttl: number,
  forceRefresh: boolean,
  build: () => Promise<T>,
): Promise<T & { cache: CacheInfo }> {
  const cache = responseCacheRepository();
  const hit = forceRefresh ? null : cache.get<T>(key);
  if (hit && Date.now() - hit.fetchedAt < ttl) {
    return { ...hit.payload, cache: cacheInfo(true, hit.fetchedAt, ttl) };
  }

  const payload = await build();
  const fetchedAt = Date.now();
  cache.save(key, payload, fetchedAt);
  return { ...payload, cache: cacheInfo(false, fetchedAt, ttl) };
}
