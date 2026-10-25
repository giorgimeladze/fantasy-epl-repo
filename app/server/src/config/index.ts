// All configuration. Values that depend on where the server runs come from one of
// development.ts / testing.ts / production.ts, chosen by NODE_ENV:
//   NODE_ENV=test        → testing.ts      (npm test)
//   NODE_ENV=production  → production.ts   (a future deployment)
//   anything else        → development.ts  (npm run dev, npm start, npm run backtest)
import { development } from './development.js';
import { production } from './production.js';
import { testing } from './testing.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const environments = { development, testing, production };
const environmentName =
  process.env.NODE_ENV === 'test' ? 'testing' : process.env.NODE_ENV === 'production' ? 'production' : 'development';
const env = environments[environmentName]();

export const config = {
  environment: environmentName,
  port: env.port,

  db: {
    path: env.databasePath,
    // How long /api/team, /api/head-to-head, /api/projections and /api/next-gameweek responses are served from SQLite.
    cacheTtlMs: 30 * MINUTE,
  },

  history: {
    // Community-maintained per-fixture FPL data for past seasons (github.com/vaastav/Fantasy-Premier-League).
    baseUrl: 'https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data',
    pastSeasons: 4,
    matchesPerPlayer: 4,
    logImports: env.logImports,
  },

  projections: {
    gameweeks: 5, // how many upcoming gameweeks to predict
    topPerPosition: 10,
    differentialMaxOwnership: 10, // % of managers
    differentialsPerPosition: 5,
  },

  nextGameweek: {
    captainOptions: 3,
    priceWatchPerList: 8, // league-wide risers / fallers shown
  },

  auth: {
    // Single admin account (personal tool, see CONTEXT.md).
    username: env.adminUsername,
    password: env.adminPassword,
    sessionTtlMs: 8 * HOUR,
  },

  fpl: {
    baseUrl: 'https://fantasy.premierleague.com/api',
    teamId: env.fplTeamId,
    userAgent: 'Mozilla/5.0 (fantasy-epl dashboard)',
    liveCacheTtlMs: 2 * MINUTE,
    finishedGameweekCacheTtlMs: 24 * HOUR,
    upcomingFixturesCount: 5,
    requestConcurrency: 4,
  },
} as const;
