# Fantasy EPL Dashboard

A personal Fantasy Premier League dashboard. Sign in, then see your current 15-man squad: starting XI on a pitch, bench, form, upcoming fixtures with difficulty ratings, and how many points each player has earned **for you** this season.

Two pages, linked from the navigation bar at the top:

- **My team**: the pitch, the bench and a sortable stats table.
- **Head-to-head**: for each player, their last 4 appearances against their next opponent. It shows goals, assists, minutes, clean sheets, bonus, xG/xA, points, what earned or cost them points (cards, goals conceded, blanks), and an overall verdict.

- **app/server/** — Node.js 22 + TypeScript + Express 5 API that proxies the public FPL API and caches your team in SQLite for 30 minutes
- **app/client/** — React 19 + TypeScript + Vite single-page app

## Running locally

### 1. Prerequisites

- **Node.js 22.12 or newer.** The SQLite database uses Node's built-in `node:sqlite`, so nothing else needs installing. Check with `node -v`. If you use nvm, run `nvm use` (it reads `.nvmrc`).
- **Your FPL team ID.** Log in at fantasy.premierleague.com and open *Points*. The URL looks like `https://fantasy.premierleague.com/entry/1234567/event/5`, and `1234567` is your team ID.

### 2. Install

From the repo root (this installs both `app/server/` and `app/client/`):

```bash
npm install
```

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` and set your team ID and the login you want for the dashboard:

```dotenv
ADMIN_USERNAME=admin
ADMIN_PASSWORD=choose-a-password
FPL_TEAM_ID=1234567
```

| Variable | Default | Purpose |
| --- | --- | --- |
| `ADMIN_USERNAME` | – (required) | Dashboard login username |
| `ADMIN_PASSWORD` | – (required) | Dashboard login password |
| `FPL_TEAM_ID` | – (required) | Your FPL team |
| `PORT` | `3001` | API port |
| `DATABASE_PATH` | `app/server/data/fpl.sqlite` | SQLite file. It is created automatically on first run. |

### 4. Start

```bash
npm run dev
```

This starts two processes:

- the API on http://localhost:3001 (restarts when files change)
- the React app on **http://localhost:5173**, which proxies `/api` to the API

Open **http://localhost:5173** and sign in with the `ADMIN_USERNAME` and `ADMIN_PASSWORD` from your `.env`.

### 5. Production-style run (optional)

```bash
npm run build
npm start          # one process: API and built app on http://localhost:3001
```

## Caching

The first time your team loads, the server fetches it from the FPL API and stores it in the SQLite `team_cache` table. **For the next 30 minutes, every request is served from the database without calling FPL.** After that, the next request fetches fresh data.

- The dashboard shows when the data was fetched and whether it came from the cache.
- The **Refresh** button skips the cache (`GET /api/team?refresh=true`) and saves fresh data.
- To wipe the cache, stop the server and delete `app/server/data/`.
- To change the 30-minute TTL, edit `config.db.teamCacheTtlMs` in [`app/server/src/config.ts`](app/server/src/config.ts).
- The Head-to-head page is cached the same way (`config.db.headToHeadCacheTtlMs`), with its own Refresh button.

### Match history

FPL's API only has match-by-match stats for the current season. Earlier seasons come from the community-maintained [vaastav/Fantasy-Premier-League](https://github.com/vaastav/Fantasy-Premier-League) dataset.

- **First visit:** the first time you open Head-to-head, the server downloads the last 4 seasons (about 20 MB of CSV) and stores them in SQLite. This takes a few seconds.
- **After that:** past seasons never change, so they are never downloaded again. The table is about 17 MB.
- **Missing seasons:** if a season isn't published yet, it is skipped and retried on a later load.
- **Settings:** change the number of seasons and matches in `config.history`.

## Tests

Server tests use **Mocha**, with `node:assert` for assertions and `supertest` for HTTP routes. They never call the network. `fetch` is stubbed to return mocked responses from [`app/server/test/mocks/fpl/`](app/server/test/mocks/fpl/) (FPL API) and [`app/server/test/mocks/history/`](app/server/test/mocks/history/) (past-season CSVs), and the database is in-memory SQLite.

```bash
npm test                         # all server tests
npm run test:watch -w app/server     # re-run on change
```

| File | Covers |
| --- | --- |
| `test/services/pointsCalculator.test.ts` | Captain/vice/triple captain, autosubs, bench boost, "points for me" |
| `test/services/teamService.test.ts` | Building the team from mocked FPL data, the 30-minute SQLite cache, error mapping |
| `test/services/authService.test.ts` | Login, session expiry, logout |
| `test/services/headToHeadService.test.ts` | Last 4 matches vs the next opponent across seasons, summaries, caching |
| `test/services/headToHeadInsights.test.ts` | What earned or cost points per position, results, verdicts |
| `test/services/historyImporter.test.ts` | Season helpers, CSV → records, import-once and skipping missing seasons |
| `test/db/teamCacheRepository.test.ts` | Migrations and the cache table: read, upsert, delete |
| `test/db/fixtureHistoryRepository.test.ts` | Storing seasons, querying matches against an opponent |
| `test/utils/csv.test.ts` | CSV parsing (quotes, CRLF, blank lines) |
| `test/routes.test.ts` | HTTP endpoints end to end (auth, `/api/team`, `/api/head-to-head`, cache, errors) |

The mock data describes a 2-gameweek season for team `123456`. GW1 is finished: Salah is captain and Gvardiol is auto-subbed for Colwill. GW2 is live: Isak has been swapped for Jackson and Haaland is captain. There are also upcoming fixtures, one of them unscheduled. To add a scenario, drop a JSON file in `test/mocks/fpl/` and map it with `mockFplApi({ '/path/': 'file.json' })`. You can also pass an inline response, e.g. `{ status: 503 }`.

The history mocks cover 2023-24 to 2025-26; 2022-23 is deliberately missing to test the skip path. In them, Salah has 5 games against Arsenal (one at 0 minutes, which is ignored), Raya changes club, and Haaland never meets his next opponent.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API and client in watch mode |
| `npm run build` | Compiles the server to `app/server/dist` and builds the client to `app/client/dist` |
| `npm start` | Runs the built server, which also serves the built client |
| `npm test` | Mocha test suite (server) |
| `npm run typecheck` | Type-checks server, tests and client |

## API

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/health` | – | Liveness check |
| POST | `/api/auth/login` | – | `{ username, password }` → `{ token, username, expiresAt }` |
| GET | `/api/auth/session` | Bearer | Current session |
| POST | `/api/auth/logout` | Bearer | Ends the session |
| GET | `/api/team` | Bearer | Manager summary, current gameweek, 15 players with stats and fixtures, and `cache` info. `?refresh=true` skips the cache. |
| GET | `/api/head-to-head` | Bearer | Each player's last 4 matches against their next opponent, with insights, a summary and `cache` info. `?refresh=true` skips the cache. |

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| "ADMIN_USERNAME and ADMIN_PASSWORD must be set" on startup | Add both to `.env` |
| "FPL_TEAM_ID is not configured" | Set `FPL_TEAM_ID` in `.env` and restart `npm run dev` |
| "FPL resource not found: /entry/…" | The team ID is wrong |
| "The FPL API is updating" (503) | FPL is processing a gameweek. Try again in a few minutes. |
| `EADDRINUSE` on 3001 or 5173 | Another process is using the port. Stop it or set `PORT` (if you change `PORT`, also update the proxy in `app/client/vite.config.ts`). |
| Stale data | Click **Refresh**, or delete `app/server/data/` |
| "Could not download historical data" | GitHub isn't reachable. The page works again once it is; seasons already stored are kept. |

## Docs

- [AGENTS.md](AGENTS.md): conventions for AI coding agents (also loaded via `CLAUDE.md`)
- [CONTEXT.md](CONTEXT.md): FPL domain notes, the FPL API endpoints used, how the points and caching work
- [app/specs/](app/specs/): one spec per major update, covering requirements, what is done and what is still open

> ⚠️ Authentication is intentionally basic: one account set through environment variables and compared in plain text, with sessions held in memory. It is fine on your own machine. Do not expose it publicly as it is.
