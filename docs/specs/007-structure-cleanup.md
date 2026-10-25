# 007 — Structure cleanup, linting and agent guides

- **Status:** Done
- **Started:** 2026-10-25
- **Scope:** Make the code simpler to read and change without altering behaviour: shared helpers, smaller files, clear layer boundaries, ESLint as linter and formatter, and how-to skills that cut the context agents need
- **Builds on:** [001](001-initial-dashboard.md)–[006](006-planner.md). No API or UI behaviour changes; every existing test passes unchanged.

## Goal

The code had grown by copy: the same rounding, price and position helpers in up to six files, page files holding up to nine components, a 436-line planner service, and one feature reaching into another's internals. Reading one change meant reading several large files. This update removes the duplication, gives every file one job, enforces the boundaries with lint rules, and moves the how-to guides into skills that are only loaded when a task needs them.

## Requirements

### R1. Server: shared code and boundaries
- One home for helpers used by several features (`src/shared/`); the transfer/chip inputs shared by transfers and planner in `shared/decision/`.
- A feature uses another only via its `models.ts` or public `<feature>Service.ts`, enforced by ESLint.

### R2. Server: less boilerplate, smaller files
- One helper for the cached team endpoint (`cachedEndpoint`), so services and routes don't repeat team id / refresh / cache-key handling.
- Validation and errors in one style (`HttpError`, `positiveInt`).
- Services over ~200 lines split by job (planner, projections, next gameweek's price watch).

### R3. Client: features, shared UI, one route table
- Each page and its own components in `features/<feature>/`; only shared components in `components/`.
- One formatter module; shared `ErrorMessage`, `StatTiles`, `Segmented`.
- One route table for URL, nav link and render; `useApiResource` handles mutations too.

### R4. Tooling
- ESLint (typescript-eslint, @stylistic as the formatter, react-hooks) with `npm run lint`, `lint:fix` and `check` (lint + typecheck + tests).

### R5. Agent guides that cost fewer tokens
- How-tos as skills in `.claude/skills/` (loaded on demand): new endpoint (with a scaffold script), writing server code, tests, config, migrations, model changes, components, pages, specs.
- A short `AGENTS.md` (rules only), a `CLAUDE.md` for the client and `shared/`, migration notes in `db/CLAUDE.md`.
- The spec index says which spec to read.

## Done

- [x] **R1**: `shared/numbers.ts`, `shared/positions.ts`, `shared/lineupOptimizer.ts`, `shared/playerReasons.ts`; `shared/decision/` (`decisionContext`, `transferSearch`, `transferOption`, `freeTransfers`, `sellingPrices`, `transferReasons`). The `GKP → GK` mapping, rounding, price conversion and "available player" check each exist once. Lint rule `no-restricted-imports` keeps the boundary.
- [x] **R2**: `cachedEndpoint` in `db/responseCache.ts` (all 6 team endpoints); routes call `service.getX(forceRefresh(req))`. Login and player-id validation throw `HttpError`. `plannerService` (436 lines) → `plannerService`, `chipAdvice`, `rotationAdvice`, `draftService`, `mappers`; `projectionService` → loader + pure `leagueProjection`; price-watch assembly moved into the pure `priceWatch.ts`.
- [x] **R3**: `features/{auth,dashboard,headToHead,predictions,nextGameweek,transfers,planner}`; the three largest pages (316, 312, 435 lines) split into one component per section. `lib/format.ts` replaces the formatters each page and component defined for itself. `routes.ts` replaces the route list, nav list and the ternary chain in `App`. `useDraft` replaced by `useApiResource().mutate`. Lint rules keep features from importing each other.
- [x] **R4**: `eslint.config.js` at the root; ESLint parses with TypeScript 6 (root devDependency) as typescript-eslint doesn't support TypeScript 7 yet. All hook-dependency warnings fixed (no disabled rules).
- [x] **R5**: 9 skills; `app/server/src/docs/` moved into them; `new-endpoint/scaffold.mjs` creates a passing endpoint end to end (checked: `npm run check` passes right after scaffolding).

- [x] Test reliability: the test app now listens on `127.0.0.1` explicitly (`test/helpers/namespace.ts`). With supertest's default random port on every interface, a local process holding the same port on `127.0.0.1` (e.g. editor helpers) intermittently answered test requests.

Checks: `npm run check` (lint, typecheck, 96 tests) and `npm run build` pass. The model is unchanged, so no new backtest numbers.

## Known limitations

- `styles.css` is still one file (out of scope for this update).
- There are no client tests; the client was checked by typecheck, lint and build, not in a browser.
- `headToHeadService.ts` (~210 lines) was left as is.

## Possible next steps

- [ ] Split `styles.css` per feature.
- [ ] A PostToolUse hook that runs `eslint --fix` on edited files.
