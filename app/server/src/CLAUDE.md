# app/server/src

Express API, organised by feature. Each feature folder holds its routes, service, pure logic and API types:

- `auth/`, `team/`, `headToHead/`, `projections/` — one per `/api/*` route group; each has a `routes.ts` mounted in `routes.ts` here.
- `fpl/` — the only code that talks to the FPL API, plus the raw FPL payload types.
- `history/` — past seasons: downloading the CSVs and the `player_fixture_history` table.
- `db/` — SQLite connection, migrations and the shared response cache.
- `utils/` — `HttpError` + error middleware + `forceRefresh(req)`, CSV parser, `mapWithConcurrency`.
- `scripts/` — CLI entry points (`npm run backtest`).

Request flow: `server.ts` → `app.ts` → `routes.ts` → `<feature>/routes.ts` (thin: parse, `requireAuth`, call the service) → `<feature>/<feature>Service.ts` (fetch via `fplClient`, cache via `cachedResponse`).

Adding a feature: new folder with `routes.ts`, a service, and `models.ts` for its response types; mount it in `routes.ts`; re-export `models.ts` from `app/client/src/types.ts`; add a method to `apiClient` in `test/helpers/namespace.ts` and an E2E spec.

`<feature>/models.ts` files are the API contract and are imported by the client, so they must contain types only (no runtime imports, no Node types).
