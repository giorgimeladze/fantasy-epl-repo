// Every /api endpoint, callable from tests. setup.ts logs in once and exports a ready `api`.
import assert from 'node:assert/strict';
import request, { type Test } from 'supertest';
import { createApp } from '../../src/app.js';
import { config } from '../../src/config/index.js';

// Listening on 127.0.0.1 explicitly. supertest's default (a random port on every interface) can be handed a port
// number that another local process already holds on 127.0.0.1, which then answers the test's requests instead.
const app = createApp().listen(0, '127.0.0.1');

/** Stops the app's test server (setup.ts calls it after all specs). */
export function closeApp(): Promise<void> {
  return new Promise((resolve, reject) => app.close((err) => (err ? reject(err) : resolve())));
}

/** Logs in as the admin (the only user) and returns the session token. */
export async function login(): Promise<string> {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: config.auth.username, password: config.auth.password });
  assert.equal(res.status, 200, `login failed: ${res.body.error}`);
  return res.body.token;
}

/** A client for every /api endpoint, sending `token` (if any) as the bearer token. */
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
    transfers: ({ refresh = false } = {}) => get('/transfers', refresh),
    planner: ({ refresh = false } = {}) => get('/planner', refresh),
    draft: () => get('/planner/draft'),
    saveDraft: (body: object) => withToken(request(app).put('/api/planner/draft')).send(body),
    clearDraft: () => withToken(request(app).delete('/api/planner/draft')),
  };
}
