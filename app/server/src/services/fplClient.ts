import { config } from '../config.js';
import type { FplBootstrap, FplEntry, FplFixture, FplLive, FplPicks } from '../models/fpl.js';
import { HttpError } from '../utils/httpError.js';

interface CacheEntry {
  expiresAt: number;
  value: Promise<unknown>;
}

// Caches the in-flight promise so concurrent callers share a single request.
const cache = new Map<string, CacheEntry>();

async function fetchJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.fpl.baseUrl}${path}`, {
      headers: { 'User-Agent': config.fpl.userAgent, Accept: 'application/json' },
    });
  } catch (err) {
    throw new HttpError(502, `Could not reach the FPL API (${(err as Error).message})`);
  }

  if (res.status === 404) throw new HttpError(404, `FPL resource not found: ${path}`);
  if (res.status === 503) throw new HttpError(503, 'The FPL API is updating, try again in a few minutes');
  if (!res.ok) throw new HttpError(502, `FPL API responded ${res.status} for ${path}`);
  return (await res.json()) as T;
}

function getCached<T>(path: string, ttlMs: number): Promise<T> {
  const now = Date.now();
  const hit = cache.get(path);
  if (hit && hit.expiresAt > now) return hit.value as Promise<T>;

  const value = fetchJson<T>(path);
  const entry: CacheEntry = { expiresAt: now + ttlMs, value };
  cache.set(path, entry);
  value.catch(() => {
    if (cache.get(path) === entry) cache.delete(path);
  });
  return value;
}

function ttl(finished: boolean): number {
  return finished ? config.fpl.finishedGameweekCacheTtlMs : config.fpl.liveCacheTtlMs;
}

export const fplClient = {
  getBootstrap(): Promise<FplBootstrap> {
    return getCached('/bootstrap-static/', config.fpl.liveCacheTtlMs);
  },

  getEntry(teamId: number): Promise<FplEntry> {
    return getCached(`/entry/${teamId}/`, config.fpl.liveCacheTtlMs);
  },

  getPicks(teamId: number, gameweek: number, finished: boolean): Promise<FplPicks> {
    return getCached(`/entry/${teamId}/event/${gameweek}/picks/`, ttl(finished));
  },

  getLive(gameweek: number, finished: boolean): Promise<FplLive> {
    return getCached(`/event/${gameweek}/live/`, ttl(finished));
  },

  getUpcomingFixtures(): Promise<FplFixture[]> {
    return getCached('/fixtures/?future=1', config.fpl.liveCacheTtlMs);
  },

  clearCache(): void {
    cache.clear();
  },
};
