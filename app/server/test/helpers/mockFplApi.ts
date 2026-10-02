import { existsSync, readFileSync } from 'node:fs';
import { config } from '../../src/config.js';
import { fplClient } from '../../src/services/fplClient.js';

const MOCKS_DIR = new URL('../mocks/fpl/', import.meta.url);
const HISTORY_MOCKS_DIR = new URL('../mocks/history/', import.meta.url);

/** Team ID used throughout test/mocks/fpl (matches FPL_TEAM_ID in test/setup.ts). */
export const MOCK_TEAM_ID = 123456;

/** A mock file name in test/mocks/fpl, or an inline response. */
export type MockRoute = string | { status: number; body?: unknown };

const DEFAULT_ROUTES: Record<string, MockRoute> = {
  '/bootstrap-static/': 'bootstrap-static.json',
  [`/entry/${MOCK_TEAM_ID}/`]: 'entry.json',
  [`/entry/${MOCK_TEAM_ID}/event/1/picks/`]: 'picks-gw1.json',
  [`/entry/${MOCK_TEAM_ID}/event/2/picks/`]: 'picks-gw2.json',
  '/event/1/live/': 'live-gw1.json',
  '/event/2/live/': 'live-gw2.json',
  '/fixtures/?future=1': 'fixtures-future.json',
  '/element-summary/9/': 'element-summary-9.json',
};

// Players without a mock file have no matches this season.
const ELEMENT_SUMMARY_PATH = /^\/element-summary\/\d+\/$/;
const EMPTY_ELEMENT_SUMMARY: MockRoute = { status: 200, body: { history: [] } };

export function loadMock<T>(fileName: string): T {
  return JSON.parse(readFileSync(new URL(fileName, MOCKS_DIR), 'utf8')) as T;
}

export interface FplApiMock {
  /** FPL API paths requested while the mock was installed, in order. */
  calls: string[];
  /** Historical-data paths (e.g. "2025-26/teams.csv") requested, in order. */
  historyCalls: string[];
  restore(): void;
}

/**
 * Replaces global fetch so requests to the FPL API are answered from test/mocks/fpl and
 * requests to the historical data source from test/mocks/history/<season>/.
 * Unknown paths get a 404 like the real sources (element summaries default to an empty
 * history); other URLs pass through untouched.
 * Also clears fplClient's in-memory cache so every test starts cold.
 */
export function mockFplApi(overrides: Record<string, MockRoute> = {}): FplApiMock {
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  const historyCalls: string[] = [];
  const routes = { ...DEFAULT_ROUTES, ...overrides };

  fplClient.clearCache();

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

    if (url.startsWith(`${config.history.baseUrl}/`)) {
      const path = url.slice(config.history.baseUrl.length + 1);
      historyCalls.push(path);
      const file = new URL(path, HISTORY_MOCKS_DIR);
      if (!existsSync(file)) return new Response('404: Not Found', { status: 404 });
      return new Response(readFileSync(file, 'utf8'), { headers: { 'Content-Type': 'text/plain' } });
    }

    if (!url.startsWith(config.fpl.baseUrl)) return realFetch(input, init);

    const path = url.slice(config.fpl.baseUrl.length);
    calls.push(path);

    const route = routes[path] ?? (ELEMENT_SUMMARY_PATH.test(path) ? EMPTY_ELEMENT_SUMMARY : undefined);
    if (route === undefined) return Response.json({ detail: 'Not found.' }, { status: 404 });
    if (typeof route === 'string') return Response.json(loadMock(route));
    return Response.json(route.body ?? {}, { status: route.status });
  }) as typeof fetch;

  return {
    calls,
    historyCalls,
    restore() {
      globalThis.fetch = realFetch;
      fplClient.clearCache();
    },
  };
}
