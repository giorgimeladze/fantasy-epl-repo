import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// server/ — same relative location from src/ (tsx) and dist/ (compiled).
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT ?? 3001),

  db: {
    // SQLite file; use ":memory:" for an ephemeral database (tests do).
    path: process.env.DATABASE_PATH ?? path.join(serverRoot, 'data', 'fpl.sqlite'),
    teamCacheTtlMs: 30 * MINUTE,
    headToHeadCacheTtlMs: 30 * MINUTE,
  },

  history: {
    // Community-maintained per-fixture FPL data for past seasons (github.com/vaastav/Fantasy-Premier-League).
    baseUrl: 'https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data',
    pastSeasons: 4,
    matchesPerPlayer: 4,
  },

  auth: {
    // Single admin account (personal tool, see CONTEXT.md). Both are required; set them in .env.
    username: process.env.ADMIN_USERNAME ?? '',
    password: process.env.ADMIN_PASSWORD ?? '',
    sessionTtlMs: 8 * HOUR,
  },

  fpl: {
    baseUrl: 'https://fantasy.premierleague.com/api',
    // Set FPL_TEAM_ID in .env, or replace the fallback 0 with your team ID.
    teamId: Number(process.env.FPL_TEAM_ID ?? 0),
    userAgent: 'Mozilla/5.0 (fantasy-epl dashboard)',
    liveCacheTtlMs: 2 * MINUTE,
    finishedGameweekCacheTtlMs: 24 * HOUR,
    upcomingFixturesCount: 5,
    requestConcurrency: 4,
  },
} as const;
