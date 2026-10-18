// Everything an E2E spec needs: a client for every /api endpoint, login,
// a per-test reset, and helpers for faking config or the clock.
import assert from 'node:assert/strict';
import request, { type Response, type Test } from 'supertest';
import { createApp } from '../../src/app.js';
import { config } from '../../src/config.js';
import { fixtureHistoryRepository } from '../../src/history/fixtureHistoryRepository.js';
import { responseCache } from '../../src/db/responseCache.js';
import { mockFplApi, restoreFetch } from './mockFplApi.js';

const app = createApp();

/** The admin account from test/setup.ts. */
export const ADMIN = { username: config.auth.username, password: config.auth.password };

/** A client for every /api endpoint. Pass a token to call the protected ones. */
export function apiClient(token?: string) {
  function withToken(req: Test): Test {
    return token ? req.set('Authorization', `Bearer ${token}`) : req;
  }

  function get(path: string, refresh = false): Test {
    return withToken(request(app).get(`/api${path}${refresh ? '?refresh=true' : ''}`));
  }

  return {
    /** Any GET under /api, for routes without their own method. */
    get: (path: string) => get(path),

    health: () => get('/health'),
    session: () => get('/auth/session'),
    logout: () => withToken(request(app).post('/api/auth/logout')),

    team: ({ refresh = false } = {}) => get('/team', refresh),
    headToHead: ({ refresh = false } = {}) => get('/head-to-head', refresh),
    scoutOptions: () => get('/head-to-head/options'),
    scoutPlayer: (id: number | string, { refresh = false } = {}) => get(`/head-to-head/players/${id}`, refresh),
    projections: ({ refresh = false } = {}) => get('/projections', refresh),
    nextGameweek: ({ refresh = false } = {}) => get('/next-gameweek', refresh),
  };
}

export type ApiClient = ReturnType<typeof apiClient>;

/** A client without a token. */
export const anonymous = apiClient();

export function login(credentials: { username?: string; password?: string } = ADMIN): Test {
  return request(app).post('/api/auth/login').send(credentials);
}

/** Logs in as the admin and returns a client that sends the session token. */
export async function loginAsAdmin() {
  const res = await login();
  assert.equal(res.status, 200, `admin login failed: ${res.body.error}`);
  return apiClient(res.body.token);
}

/**
 * Call inside a `describe`: before each test, empty the SQLite caches and history
 * and install the FPL mock; afterwards, put the real fetch back.
 */
export function useTestEnvironment(): void {
  beforeEach(() => {
    responseCache.clear();
    fixtureHistoryRepository().clear();
    mockFplApi();
  });

  afterEach(() => restoreFetch());
}

/** Runs `call` as if FPL_TEAM_ID were `teamId`. */
export async function withTeamId(teamId: number, call: () => Promise<Response>): Promise<Response> {
  const fpl = config.fpl as { teamId: number };
  const original = fpl.teamId;
  fpl.teamId = teamId;
  try {
    return await call();
  } finally {
    fpl.teamId = original;
  }
}

/** Runs `call` as if ADMIN_USERNAME and ADMIN_PASSWORD were not set. */
export async function withoutAdminCredentials(call: () => Promise<Response>): Promise<Response> {
  const auth = config.auth as { username: string; password: string };
  const original = { ...auth };
  auth.username = '';
  auth.password = '';
  try {
    return await call();
  } finally {
    Object.assign(auth, original);
  }
}

/** Runs `call` with the clock moved `ms` into the future, to expire caches and sessions. */
export async function withClockAhead(ms: number, call: () => Promise<Response>): Promise<Response> {
  const realNow = Date.now;
  Date.now = () => realNow() + ms;
  try {
    return await call();
  } finally {
    Date.now = realNow;
  }
}
