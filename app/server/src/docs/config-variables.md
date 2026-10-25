# Config variables

All settings are read from `config` (`import { config } from '../config/index.js'`). Never read `process.env` anywhere else.

## Where a setting goes

| Kind | Where | Example |
| --- | --- | --- |
| Same everywhere (TTLs, URLs, model sizes) | `config/index.ts`, in the matching section | `projections.gameweeks: 5` |
| Differs per environment or comes from `.env` | all three of `development.ts`, `testing.ts`, `production.ts`, same field name; then wire it into `index.ts` | `databasePath`, `fplTeamId` |
| Secret (passwords, keys) | `.env` only, read in `development.ts` / `production.ts`; never committed | `ADMIN_PASSWORD` |

## Environments (picked by `NODE_ENV`)

- `development.ts` — default: `npm run dev`, `npm start`, `npm run backtest`. Reads the repo-root `.env`, with defaults where a safe one exists.
- `testing.ts` — `npm test` (`NODE_ENV=test`). **Fixed values, never `.env`**, so tests run the same everywhere. Running mocha without `npm test` stops with an error instead of using the real database.
- `production.ts` — only with `NODE_ENV=production`, for a future deployment. Like development, but required variables throw at startup if missing.

## Rules

1. A new `.env` variable also goes in `.env.example` with a comment (no real values).
2. Convert types at the edge: `Number(process.env.PORT ?? 3001)`, never pass raw strings around.
3. Name the unit in the field name: `cacheTtlMs`, `differentialMaxOwnership // %`.
4. Config is read once at import time; tests that need another value use a helper in `test/setup.ts` (e.g. `withTeamId`) rather than editing `process.env`.
