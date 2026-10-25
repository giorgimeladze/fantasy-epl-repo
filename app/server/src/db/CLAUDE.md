# db/

Built-in `node:sqlite` (still flagged experimental in Node 22), one shared connection opened lazily from `config.db.path` (`:memory:` in tests).

- `database.ts` — `MIGRATIONS` is append-only: add a new SQL string, never edit an existing one. The version is tracked in `PRAGMA user_version`.
- `responseCache.ts` — `cachedEndpoint(name, build)` serves a team endpoint under `<name>:<teamId>` (what services use); `cachedResponse(key, ttl, forceRefresh, build)` underneath caches assembled API responses as JSON (`team:<id>`, `head-to-head:<id>`, `head-to-head:player:<id>`, `projections:<id>`, `next-gameweek:<id>`, `transfers:<id>`, `planner:<id>`). Failed builds are not cached.
- `draft_plan` (migration 6) holds the planner's one draft plan per team; it's user data, not a cache.

After changing a cached response's shape, old rows keep the old shape until they expire; clear them in a migration (`DELETE FROM response_cache`) or delete `app/server/data/` locally.

Migration history (what each one did on upgrade; see the `db-migration` skill):
- 3 (spec 003) — new history columns; forgets imported seasons (past seasons download again, ~5 s) and clears caches.
- 4 — drops `team_cache`; the team lives in `response_cache` (`team:<id>`).
- 5 (spec 004) — clears `response_cache` (projections gained fields).
- 6 (spec 006) — adds `draft_plan` (user data: deleting `app/server/data/` loses it); clears `response_cache` (projections gained `inputs`).
