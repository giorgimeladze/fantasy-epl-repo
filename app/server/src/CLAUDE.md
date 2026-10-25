# app/server/src

Express API, organised by feature. Each feature folder holds its routes, service, pure logic and API types:

- `auth/`, `team/`, `headToHead/`, `projections/`, `nextGameweek/` — one per `/api/*` route group; each has a `routes.ts` mounted in `routes.ts` here.
- `fpl/` — the only code that talks to the FPL API, plus the raw FPL payload types.
- `history/` — past seasons: downloading the CSVs and the `player_fixture_history` table.
- `db/` — SQLite connection, migrations and the shared response cache.
- `utils/` — `HttpError` + error middleware + `forceRefresh(req)`, CSV parser, `mapWithConcurrency`.
- `config/` — all settings; `development.ts` / `testing.ts` / `production.ts` hold what differs per `NODE_ENV`.
- `scripts/` — CLI entry points (`npm run backtest`).
- `docs/` — ground rules for common tasks (linked below).

Request flow: `server.ts` → `app.ts` → `routes.ts` → `<feature>/routes.ts` (thin: parse, `requireAuth`, call the service) → `<feature>/<feature>Service.ts` (fetch via `fplClient`, cache via `cachedResponse`).

Guidelines: [adding an endpoint](docs/adding-endpoints.md), [writing tests](docs/writing-tests.md), [config variables](docs/config-variables.md). `<feature>/models.ts` files must stay types-only (the client imports them).
