# AGENTS.md

Instructions for AI coding agents (Claude Code reads this via `CLAUDE.md`). Read [CONTEXT.md](CONTEXT.md) for the domain background and the specs in [docs/specs/](docs/specs/) for what is in or out of scope before making changes.

## Project shape

npm workspaces monorepo:

- `app/server/` — Node 22 + TypeScript + Express 5 API. ESM (`"type": "module"`, `module: nodenext`), so **relative imports must end in `.js`**.
  - `src/` is organised by feature: `auth/`, `team/`, `headToHead/`, `projections/`, `nextGameweek/` (each with `routes.ts`, a service, pure logic and `models.ts` for its API types), plus `fpl/` (FPL API client + raw payload types), `history/` (past seasons in SQLite), `db/` (connection, migrations, response cache), `utils/`, `scripts/`. `src/routes.ts` mounts the feature routers; `src/config.ts` holds all configuration. **Each folder has a short `CLAUDE.md`**; read it before working there.
  - `test/` — end-to-end Mocha specs, one per endpoint group (`*.test.ts`, run through tsx), `test/helpers/namespace.ts` (`apiClient` with a method per endpoint, `loginAsAdmin`, `useTestEnvironment`, `withTeamId` / `withoutAdminCredentials` / `withClockAhead`), `test/helpers/mockFplApi.ts` (stubs global `fetch`), `test/mocks/fpl/*.json` (mocked FPL responses), `test/mocks/history/<season>/` (mocked past-season CSVs), `test/setup.ts` (in-memory DB + mock team ID).
- `app/client/` — React 19 + Vite + TypeScript SPA.
  - `src/api.ts` — the only place that calls `fetch`; handles the bearer token.
  - `src/types.ts` — re-exports the server's `<feature>/models.ts` files (type-only), so the API contract is defined once. Add new feature models there.
  - `src/pages/` — `LoginPage`, `DashboardPage` (`#/`), `HeadToHeadPage` (`#/head-to-head`), `PredictionsPage` (`#/predictions`), `NextGameweekPage` (`#/next-gw`). `src/components/` — presentational pieces, incl. `NavBar`, `HeadToHeadCard` (used for squad and scouted players) `PlayerScout` (club → player picker at the bottom of Head-to-head) `ProjectionTable` (predictions per gameweek with an expandable breakdown), `LineupPitch` (suggested XI + bench) and `PriceWatchList`.
  - `src/hooks/` — `useHashRoute` (tiny hash router; add new pages to `ROUTES` and `NavBar`'s `LINKS`), `useApiResource` (load/refresh/error/401 handling for a page).

## Commands

```bash
npm install                   # once, from the repo root
npm run dev                   # API on :3001 + Vite on :5173 (proxies /api)
npm run typecheck             # both workspaces
npm test                      # server tests (mocha, mocked FPL API, in-memory SQLite)
npm run backtest              # score the predicted-points model against last season (downloads history once)
npm run build && npm start    # production: Express serves app/client/dist
```

Always run `npm run typecheck` and `npm test` after changes.

## Conventions

- TypeScript `strict` everywhere; no `any` — type FPL payloads in `fpl/models.ts`.
- Never call the FPL API from the browser (CORS + rate limits). Go through `fplClient`, which caches responses; finished gameweeks are cached much longer than live data.
- Prices from FPL are integers in tenths of £m (`now_cost: 105` = £10.5m). Convert in `teamService`, not in the client.
- Throw `HttpError` (from `utils/http.ts`) for expected failures; the error middleware turns it into `{ "error": string }` JSON.
- Keep scoring rules (multipliers, autosubs, captaincy) in `team/pointsCalculator.ts` as pure functions, covered through the endpoint tests (`team.test.ts` checks "points for me"). Prediction rules live in `projections/projectionModel.ts`, also pure; check model changes with `npm run backtest` and record the numbers in the spec.
- Route handlers stay thin (parse, `requireAuth`, call the service); cache responses with `cachedResponse` from `db/responseCache.ts`.
- Plain CSS in `app/client/src/styles.css`; no UI framework.
- Schema changes: **append** a new SQL string to `MIGRATIONS` in `src/db/database.ts`; never edit an existing entry.
- Match players and clubs across seasons by `code`, never by `id` (FPL re-numbers ids every season).
- Tests are end to end only: go through the HTTP API with the client in `test/helpers/namespace.ts` (add a method there for every new endpoint), no unit tests of single functions.
- Tests must not hit the network. Call `useTestEnvironment()` inside each top-level `describe` (fresh SQLite caches + FPL mock per test). To change FPL responses mid-test call `mockFplApi(overrides)`; check requests with `fplCalls` / `historyCalls` and `resetCalls()`. Add new FPL scenarios as JSON files in `test/mocks/fpl/`.
- New behaviour in services or routes needs an E2E test.

## Gotchas

- Admin credentials come from `ADMIN_USERNAME` / `ADMIN_PASSWORD` (no defaults; the server exits on startup without them, and `authService.login` rejects everything if they're empty). Never commit real values; tests set their own in `test/setup.ts`. Sessions are in memory and are lost on restart.
- `node:sqlite` is still flagged experimental in Node 22; scripts pass `--disable-warning=ExperimentalWarning`. The DB lives in `app/server/data/` (gitignored); deleting it is safe.
- `config.ts` reads env vars at import time, which is why `test/setup.ts` sets `DATABASE_PATH`, `FPL_TEAM_ID` and the admin credentials before any spec loads.
- After changing the shape of a cached response, existing `response_cache` rows have the old shape until they expire (30 min) — delete `app/server/data/` locally.
- `FPL_TEAM_ID` must be set (env var or `config.ts`) or `/api/team` returns a 500 explaining so.
- Migration 3 (spec 003) forgets imported seasons and clears the caches, so the first load after upgrading downloads past seasons again (~5 s). Migration 4 drops `team_cache`; the team now lives in `response_cache` too. Migration 5 (spec 004) clears `response_cache` because the projections response gained fields.
- Past-season data comes from github.com/vaastav/Fantasy-Premier-League (`config.history.baseUrl`). It is imported once per season into SQLite; to force a re-import, delete `app/server/data/`.
- The FPL API is unofficial and undocumented; fields can change between seasons. It may return 503 while gameweeks are being updated.
- Specs live in [docs/specs/](docs/specs/), one file per major update (`NNN-short-name.md`). Start a big change by copying `docs/specs/_template.md` to the next number. Keep the active spec up to date: move items to "Done" as you complete them. Don't rewrite finished specs. Later specs supersede earlier ones. See [docs/specs/README.md](docs/specs/README.md).
- Backlog ideas and research that aren't specs yet live in [docs/tasks/](docs/tasks/) (e.g. [recommendations-roadmap.md](docs/tasks/recommendations-roadmap.md): what to build and what to avoid). Turn a task into a numbered spec when work starts.
