# app/server/src

Express API, organised by feature. Each feature folder holds its routes, service, pure logic and API types:

- `auth/`, `team/`, `headToHead/`, `projections/`, `nextGameweek/`, `transfers/`, `planner/` — one per `/api/*` route group; each has a `routes.ts` mounted in `routes.ts` here.
- `shared/` — pure code used by two or more features (numbers, positions, lineup optimizer, reason phrases) and `shared/decision/` (the transfer/chip inputs for `transfers/` and `planner/`).
- `fpl/` — the only code that talks to the FPL API, plus the raw FPL payload types.
- `history/` — past seasons: downloading the CSVs and the `player_fixture_history` table.
- `db/` — SQLite connection, migrations and the shared response cache (`cachedEndpoint`).
- `utils/` — `HttpError` + error middleware + `forceRefresh(req)` + `positiveInt`, CSV parser, `mapWithConcurrency`.
- `config/` — all settings; `development.ts` / `testing.ts` / `production.ts` hold what differs per `NODE_ENV`.
- `scripts/` — CLI entry points (`npm run backtest`).

Request flow: `server.ts` → `app.ts` → `routes.ts` → `<feature>/routes.ts` (thin: validate, call the service) → `<feature>Service.ts` (load via `fplClient` / other services, cache via `cachedEndpoint`) → pure modules.

A feature uses another only via its `models.ts` or `<feature>Service.ts` (ESLint enforces it). `<feature>/models.ts` files stay types-only (the client imports them). Skills: `writing-server-code`, `new-endpoint`, `writing-tests`, `config-variables`, `db-migration`, `model-change`.
