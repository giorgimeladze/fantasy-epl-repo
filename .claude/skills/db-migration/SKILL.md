---
name: db-migration
description: Add a SQLite table or column, or clear cached responses after a response shape changes. Use when touching app/server/src/db/ or changing a *Response type.
---

# Database changes

The database is built-in `node:sqlite`, one file in `app/server/data/` (`:memory:` in tests). The schema version is
`PRAGMA user_version`; `MIGRATIONS` in `db/database.ts` is **append-only**.

## Add a table or column

1. Append one SQL string to `MIGRATIONS` with a comment naming the spec. Never edit an existing entry.
2. Put the queries in a `<feature>/<name>Repository.ts` (see `planner/draftRepository.ts`): typed rows in, typed values
   out, no SQL elsewhere.
3. Tests: every table is emptied before each test automatically; nothing to add in `setup.ts`.

## A cached response changed shape

`response_cache` rows keep the old shape for up to 30 minutes, so the client could get a response without the new
fields. Append `'DELETE FROM response_cache'` to `MIGRATIONS` (comment: which spec, which response). Locally you can
also delete `app/server/data/`.

## Data that isn't a cache

`draft_plan` is user data: a migration must never drop or clear it. Deleting `app/server/data/` loses it.

Past migrations and their side effects are listed in `app/server/src/db/CLAUDE.md`; add yours there.
