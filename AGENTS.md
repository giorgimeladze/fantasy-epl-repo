# AGENTS.md

Instructions for AI coding agents (Claude Code reads this via `CLAUDE.md`). Read [CONTEXT.md](CONTEXT.md) for the domain background and the specs in [app/specs/](app/specs/) for what is in or out of scope before making changes.

## Project shape

npm workspaces monorepo:

- `app/server/` — Node 22 + TypeScript + Express 5 API. ESM (`"type": "module"`, `module: nodenext`), so **relative imports must end in `.js`**.
  - `src/server.ts` — process entrypoint (listen).
  - `src/app.ts` — builds the Express app (middleware, `/api` router, static client, error handler).
  - `src/routes.ts` — all HTTP routes. Keep handlers thin; logic lives in services.
  - `src/config.ts` — all configuration, read from env vars: admin credentials, team ID, DB path and cache TTLs.
  - `src/db/` — `database.ts` (built-in `node:sqlite` connection + `PRAGMA user_version` migrations), `teamCacheRepository.ts` (`team_cache`), `responseCacheRepository.ts` (generic key → JSON cache, used by head-to-head), `fixtureHistoryRepository.ts` (`player_fixture_history` + `history_import`).
  - `src/services/` — `authService` (in-memory sessions), `fplClient` (HTTP calls to the FPL API with a short in-memory cache), `pointsCalculator` (pure scoring logic), `teamService` (assembles the dashboard payload; 30-min SQLite cache), `historyImporter` (downloads past seasons' CSVs once), `headToHeadInsights` (pure: results, what earned/cost points, verdicts), `headToHeadService` (assembles the head-to-head page; 30-min cache).
  - `src/models/` — `fpl.ts` (raw FPL API shapes, only the fields we use), `team.ts` / `auth.ts` / `headToHead.ts` (our API contract).
  - `src/middleware/` — `requireAuth`, error handler.
  - `test/` — Mocha specs (`*.test.ts`, run through tsx), `test/mocks/fpl/*.json` (mocked FPL responses), `test/mocks/history/<season>/` (mocked past-season CSVs), `test/helpers/mockFplApi.ts` (stubs global `fetch`), `test/setup.ts` (in-memory DB + mock team ID).
- `app/client/` — React 19 + Vite + TypeScript SPA.
  - `src/api.ts` — the only place that calls `fetch`; handles the bearer token.
  - `src/types.ts` — **mirror of `app/server/src/models/team.ts`, `auth.ts` and `headToHead.ts`**. When you change the API contract, update both.
  - `src/pages/` — `LoginPage`, `DashboardPage` (`#/`), `HeadToHeadPage` (`#/head-to-head`). `src/components/` — presentational pieces, incl. `NavBar`.
  - `src/hooks/` — `useHashRoute` (tiny hash router; add new pages to `ROUTES` and `NavBar`'s `LINKS`), `useApiResource` (load/refresh/error/401 handling for a page).

## Commands

```bash
npm install                   # once, from the repo root
npm run dev                   # API on :3001 + Vite on :5173 (proxies /api)
npm run typecheck             # both workspaces
npm test                      # server tests (mocha, mocked FPL API, in-memory SQLite)
npm run build && npm start    # production: Express serves app/client/dist
```

Always run `npm run typecheck` and `npm test` after changes.

## Conventions

- TypeScript `strict` everywhere; no `any` — type FPL payloads in `models/fpl.ts`.
- Never call the FPL API from the browser (CORS + rate limits). Go through `fplClient`, which caches responses; finished gameweeks are cached much longer than live data.
- Prices from FPL are integers in tenths of £m (`now_cost: 105` = £10.5m). Convert in `teamService`, not in the client.
- Throw `HttpError` (from `utils/httpError.ts`) for expected failures; the error middleware turns it into `{ "error": string }` JSON.
- Keep scoring rules (multipliers, autosubs, captaincy) in `pointsCalculator.ts` as pure functions with tests.
- Plain CSS in `app/client/src/styles.css`; no UI framework.
- Schema changes: **append** a new SQL string to `MIGRATIONS` in `src/db/database.ts`; never edit an existing entry.
- Match players and clubs across seasons by `code`, never by `id` (FPL re-numbers ids every season).
- Tests must not hit the network. Use `mockFplApi()` in `beforeEach` and `restore()` in `afterEach`; clear `teamCacheRepository()` between tests. Add new FPL scenarios as JSON files in `test/mocks/fpl/`.
- New behaviour in services or routes needs a Mocha test.

## Gotchas

- Admin credentials come from `ADMIN_USERNAME` / `ADMIN_PASSWORD` (no defaults; the server exits on startup without them, and `authService.login` rejects everything if they're empty). Never commit real values; tests set their own in `test/setup.ts`. Sessions are in memory and are lost on restart.
- `node:sqlite` is still flagged experimental in Node 22; scripts pass `--disable-warning=ExperimentalWarning`. The DB lives in `app/server/data/` (gitignored); deleting it is safe.
- `config.ts` reads env vars at import time, which is why `test/setup.ts` sets `DATABASE_PATH`, `FPL_TEAM_ID` and the admin credentials before any spec loads.
- After changing the shape of `TeamSnapshot`, existing cached rows have the old shape until they expire — delete `app/server/data/` locally.
- `FPL_TEAM_ID` must be set (env var or `config.ts`) or `/api/team` returns a 500 explaining so.
- Past-season data comes from github.com/vaastav/Fantasy-Premier-League (`config.history.baseUrl`). It is imported once per season into SQLite; to force a re-import, delete `app/server/data/`.
- The FPL API is unofficial and undocumented; fields can change between seasons. It may return 503 while gameweeks are being updated.
- Specs live in [app/specs/](app/specs/), one file per major update (`NNN-short-name.md`). Start a big change by copying `app/specs/_template.md` to the next number. Keep the active spec up to date: move items to "Done" as you complete them. Don't rewrite finished specs. Later specs supersede earlier ones. See [app/specs/README.md](app/specs/README.md).
