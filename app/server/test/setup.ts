// Test initializer, loaded by mocha before any spec (see .mocharc.json). It starts the mock
// FPL API, logs in once and resets state before every test. Specs import what they need from here:
//
//   import { api, fplCalls } from './setup.js';
//
import assert from 'node:assert/strict';
import type { Response } from 'supertest';
import { config } from '../src/config/index.js';
import { getDatabase } from '../src/db/database.js';
import { fplClient } from '../src/fpl/fplClient.js';
import { apiClient, closeApp, login } from './helpers/namespace.js';
import { mockServer, resetCalls } from './mockServer.js';

// Without NODE_ENV=test the development config (and your real database) would be used.
assert.equal(config.environment, 'testing', 'Run the tests with `npm test`, which sets NODE_ENV=test.');

export { config } from '../src/config/index.js';
export { apiClient } from './helpers/namespace.js';
export { bootstrap, fplCalls, fplFails, fplReturns, historyCalls, MOCK_TEAM_ID, resetCalls } from './mockServer.js';

/** Every /api endpoint, already logged in as the admin. */
export let api = apiClient();

// Root hooks: they run around every test in every spec.
export const mochaHooks = {
  async beforeAll() {
    mockServer.listen({ onUnhandledFrame: 'bypass' }); // requests to our own app pass through
    api = apiClient(await login());
  },

  beforeEach() {
    emptyDatabase();
    resetFplMock();
  },

  async afterAll() {
    mockServer.close();
    await closeApp();
  },
};

/** Deletes every row from every table (the schema stays), so each test starts from an empty database. */
function emptyDatabase(): void {
  // Never wipe a real database file, only the throwaway in-memory one from src/config/testing.ts.
  assert.equal(config.db.path, ':memory:', 'Refusing to empty a database file during tests.');
  const db = getDatabase();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  for (const { name } of tables as { name: string }[]) db.exec(`DELETE FROM "${name}"`);
}

/** Back to the default mock season: overrides removed, fplClient's memory cache and recorded calls cleared. */
export function resetFplMock(): void {
  mockServer.resetHandlers();
  fplClient.clearCache();
  resetCalls();
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

/** Runs `call` with the clock moved `ms` into the future, to expire caches. */
export async function withClockAhead(ms: number, call: () => Promise<Response>): Promise<Response> {
  const realNow = Date.now;
  Date.now = () => realNow() + ms;
  try {
    return await call();
  } finally {
    Date.now = realNow;
  }
}
