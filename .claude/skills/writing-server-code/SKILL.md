---
name: writing-server-code
description: Conventions for server code in app/server/src (layers, pure modules, shared/, caching, errors, helpers, FPL data rules). Use when writing or changing a service, pure logic or a route.
---

# Writing server code

## Layers (one direction only)

`routes.ts` (parse, validate, call) → `<feature>Service.ts` (load, cache, map to the response) → pure modules (rules,
no I/O) → `shared/` helpers. Each layer only calls the ones to its right.

- **A feature uses another feature only via its `models.ts` (types) or its public `<feature>Service.ts`** (e.g.
  `projectionService.getLeagueProjections`). ESLint enforces it. Code two features both need goes in `shared/`.
- **`shared/`** never imports a feature's internals. `shared/decision/` holds the transfer/chip inputs used by
  `transfers/` and `planner/` (`loadDecisionContext`, `transferSearch`, `transferOption`, free transfers, selling
  prices).
- **Pure modules** take everything as parameters, including config values and `Date.now()`, so they are easy to
  reason about and tested through the endpoint. Put a one-line `// Pure: …` header at the top.

## Helpers to reuse (don't redefine them)

| Need | Use |
| --- | --- |
| Round for a response (and survive the JSON cache) | `round2`, `round3` (`shared/numbers.ts`) |
| FPL tenths of £m → £m | `tenths` |
| FPL decimal strings (`"4.5"`) | `decimal` (0 if missing), `decimalOrNull` |
| Sums, float comparisons | `sum`, `EPSILON` |
| Positions | `POSITIONS`, `byPosition` (sort), `groupByPosition`, `positionFromCode` (`GKP`/`GK`) (`shared/positions.ts`) |
| Player can be picked | `isAvailable(p)` (status not `u` / `n`) |
| FPL element → position, upcoming fixtures | `positionOf`, `upcomingFixturesByTeam` (`fpl/fplMappers.ts`) |
| Best XI, captaincy, autosubs | `shared/lineupOptimizer.ts` |
| Reason phrases | `shared/playerReasons.ts` |
| Cache a team endpoint | `cachedEndpoint('name', build)` (`db/responseCache.ts`) |
| Expected failure → JSON error | `throw new HttpError(status, message)`; `positiveInt(value, message)` for ids |
| Bounded parallel FPL calls | `mapWithConcurrency(items, config.fpl.requestConcurrency, fn)` |

## Rules

1. TypeScript `strict`, no `any`: type raw FPL payloads in `fpl/models.ts` (only the fields you read).
2. Relative imports end in `.js` (ESM, `module: nodenext`).
3. FPL is only called through `fplClient` (it caches); never from the browser.
4. Prices: FPL sends tenths of £m. Keep tenths inside calculations, convert with `tenths()` when building the
   response. Never convert in the client.
5. Match players and clubs across seasons by `code`, never `id`.
6. A service file over ~200 lines gets split: loading/assembly stays in the service, each computation goes in its own
   module (see `planner/`: `chipAdvice.ts`, `rotationAdvice.ts`, `draftService.ts`, `mappers.ts`).
7. Response text (verdicts, reasons) is built on the server, short and plain; keep long strings wrapped at 120 columns
   with `+` at the start of the line.
8. Comments say why, not what. `/** … */` on exported functions; no commented-out code.
9. New behaviour needs an E2E test (`writing-tests` skill). Run `npm run check`.
