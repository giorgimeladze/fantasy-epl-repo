// Replaces global fetch so tests never hit the network:
// - FPL API requests are answered from test/mocks/fpl/*.json
// - past-season CSV requests are answered from test/mocks/history/<season>/
import { existsSync, readFileSync } from 'node:fs';
import { config } from '../../src/config.js';
import { fplClient } from '../../src/fpl/fplClient.js';

const FPL_MOCKS = new URL('../mocks/fpl/', import.meta.url);
const HISTORY_MOCKS = new URL('../mocks/history/', import.meta.url);

/** Team ID used throughout test/mocks/fpl (matches FPL_TEAM_ID in test/setup.ts). */
export const MOCK_TEAM_ID = 123456;

// FPL API path → mock file name in test/mocks/fpl.
const DEFAULT_ROUTES = {
  '/bootstrap-static/': 'bootstrap-static.json',
  [`/entry/${MOCK_TEAM_ID}/`]: 'entry.json',
  [`/entry/${MOCK_TEAM_ID}/event/1/picks/`]: 'picks-gw1.json',
  [`/entry/${MOCK_TEAM_ID}/event/2/picks/`]: 'picks-gw2.json',
  '/event/1/live/': 'live-gw1.json',
  '/event/2/live/': 'live-gw2.json',
  '/fixtures/?future=1': 'fixtures-future.json',
  '/fixtures/': 'fixtures.json',
  '/element-summary/9/': 'element-summary-9.json',
};

/** FPL API paths requested since the mock was installed, in order. */
export const fplCalls: string[] = [];
/** Past-season paths requested (e.g. "2025-26/teams.csv"), in order. */
export const historyCalls: string[] = [];

const realFetch = globalThis.fetch;
let routes: Record<string, string | { status: number; body?: unknown }> = DEFAULT_ROUTES;

/**
 * Installs the fake fetch, forgets earlier calls and clears fplClient's in-memory cache.
 * `overrides` replace routes, either with another mock file name or an inline response:
 *   mockFplApi({ '/bootstrap-static/': { status: 503 } })
 */
export function mockFplApi(overrides: Record<string, string | { status: number; body?: unknown }> = {}): void {
  routes = { ...DEFAULT_ROUTES, ...overrides };
  resetCalls();
  fplClient.clearCache();
  globalThis.fetch = fakeFetch;
}

/** Puts the real fetch back. */
export function restoreFetch(): void {
  globalThis.fetch = realFetch;
  fplClient.clearCache();
}

export function resetCalls(): void {
  fplCalls.length = 0;
  historyCalls.length = 0;
}

async function fakeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

  if (url.startsWith(`${config.history.baseUrl}/`)) {
    return answerHistory(url.slice(config.history.baseUrl.length + 1));
  }
  if (url.startsWith(config.fpl.baseUrl)) {
    return answerFpl(url.slice(config.fpl.baseUrl.length));
  }
  return realFetch(input, init);
}

function answerFpl(path: string): Response {
  fplCalls.push(path);
  const route = routes[path];

  if (typeof route === 'string') {
    return Response.json(JSON.parse(readFileSync(new URL(route, FPL_MOCKS), 'utf8')));
  }
  if (route) {
    return Response.json(route.body ?? {}, { status: route.status });
  }
  // Players without a mock file simply have no matches this season.
  if (/^\/element-summary\/\d+\/$/.test(path)) {
    return Response.json({ history: [] });
  }
  return Response.json({ detail: 'Not found.' }, { status: 404 });
}

function answerHistory(path: string): Response {
  historyCalls.push(path);
  const file = new URL(path, HISTORY_MOCKS);

  if (!existsSync(file)) {
    return new Response('404: Not Found', { status: 404 });
  }
  return new Response(readFileSync(file, 'utf8'), { headers: { 'Content-Type': 'text/plain' } });
}
