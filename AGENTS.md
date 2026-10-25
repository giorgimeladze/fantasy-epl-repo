# AGENTS.md

Instructions for AI coding agents (Claude Code reads this via `CLAUDE.md`). Domain background: [CONTEXT.md](CONTEXT.md). Scope: the active spec in [docs/specs/](docs/specs/) (see its index; finished specs are records, read one only when your task touches its feature).

## Project shape

npm workspaces monorepo. **Each source folder has a short `CLAUDE.md`; read the one for the folder you work in** rather than exploring.

- `app/server/` — Node 22 + TypeScript + Express 5 API (ESM: relative imports end in `.js`). `src/` is one folder per feature (`routes.ts` → `<feature>Service.ts` → pure modules, `models.ts` for API types) plus `shared/`, `fpl/`, `history/`, `db/`, `config/`, `utils/`, `scripts/`. `test/` holds the E2E Mocha specs.
- `app/client/` — React 19 + Vite SPA. `src/features/<feature>/` holds each page and its components; `src/components/` the shared ones; `src/routes.ts` the page list.

### Where to find things

Start from the folder maps, then that folder's own `CLAUDE.md`:
- Server: [app/server/src/CLAUDE.md](app/server/src/CLAUDE.md) (features, `shared/`, `fpl/`, `db/`, `config/`, request flow). Tests: `app/server/test/` (`<feature>.test.ts`, FPL mock data in `mockServer.ts`).
- Client: [app/client/src/CLAUDE.md](app/client/src/CLAUDE.md) (api, routes, hooks, formatters, shared components, one folder per page).

## Skills (how-to guides)

In `.claude/skills/<name>/SKILL.md`; Claude Code loads them when relevant, other agents read the file.

| Task | Skill |
| --- | --- |
| New `/api/*` endpoint (has a scaffold script) | [new-endpoint](.claude/skills/new-endpoint/SKILL.md) |
| Server services, pure logic, shared helpers | [writing-server-code](.claude/skills/writing-server-code/SKILL.md) |
| Tests | [writing-tests](.claude/skills/writing-tests/SKILL.md) |
| Settings / `.env` | [config-variables](.claude/skills/config-variables/SKILL.md) |
| Tables, cached response shape changes | [db-migration](.claude/skills/db-migration/SKILL.md) |
| Prediction model + backtest | [model-change](.claude/skills/model-change/SKILL.md) |
| React components | [writing-components](.claude/skills/writing-components/SKILL.md) |
| New page | [new-page](.claude/skills/new-page/SKILL.md) |
| Specs for big changes | [new-spec](.claude/skills/new-spec/SKILL.md) |

## Commands

```bash
npm install                   # once, from the repo root
npm run dev                   # API on :3001 + Vite on :5173 (proxies /api)
npm run check                 # lint + typecheck + tests: run after every change
npm run lint:fix              # ESLint is also the formatter
npm run backtest              # score the prediction model against last season
npm run build && npm start    # one process: Express serves app/client/dist
```

## Conventions

- TypeScript `strict`, no `any`; type FPL payloads in `fpl/models.ts`.
- Never call the FPL API from the browser; go through `fplClient` (it caches).
- FPL prices are tenths of £m: convert on the server (`tenths()`), never in the client.
- Match players and clubs across seasons by `code`, never `id` (FPL re-numbers ids every season).
- Scoring rules live in `team/pointsCalculator.ts`, prediction rules in `projections/projectionModel.ts`; both pure.
- Plain CSS in `app/client/src/styles.css`; no UI framework.
- Tests are end to end only and never hit the network. New behaviour in services or routes needs a test.
- Layer boundaries are lint rules: a server feature uses another only via its `models.ts` / `<feature>Service.ts`; client features never import each other.

## Gotchas

- `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `FPL_TEAM_ID` come from `.env` (no defaults; never commit real values). Tests use the fixed values in `src/config/testing.ts` and never read `.env`. Sessions are in memory, lost on restart.
- ESLint runs on TypeScript 6 (root devDependency) because typescript-eslint doesn't support TypeScript 7 yet; `tsc` in each workspace is 7. Don't "fix" the root version.
- `node:sqlite` is experimental in Node 22; scripts pass `--disable-warning=ExperimentalWarning`. The DB lives in `app/server/data/` (gitignored); deleting it is safe except for the draft plan.
- A cached response whose shape changed keeps the old shape for 30 minutes: clear it in a migration (see `db-migration`).
- The FPL API is unofficial: fields can change between seasons, and it returns 503 while gameweeks update.
- Past seasons come from github.com/vaastav/Fantasy-Premier-League, imported once per season into SQLite.
