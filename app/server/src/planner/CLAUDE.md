# planner/

`/api/planner` (chip timing + rotation pairs, cached under `planner:<id>`) and `/api/planner/draft` (GET/PUT/DELETE: the manager's one draft plan in the `draft_plan` table, never response-cached). Both start from `shared/decision/decisionContext.ts`.

- `plannerService.ts` — `/api/planner`: `chipAdvice` + `rotationAdvice`.
- `chipAdvice.ts` — each chip's value per gameweek, best week and verdict (Wildcard vs the best transfers, Free Hit, Bench Boost, Triple Captain).
- `rotationAdvice.ts` — goalkeeper pairs (first-choice keepers within `goalkeeperPairMaxPrice`) and defence pairs (expected clean sheets).
- `draftService.ts` — `/api/planner/draft`: replays the plan, adds a suggested next move per week and the market; PUT rejects (400) a plan with any broken move, GET drops them with a warning.
- `mappers.ts` — response views (`plannerPlayer`, `marketPlayer`, `lineupOf`) and `pts` for verdict text.
- Pure: `chips.ts` (availability from bootstrap `chips` windows + chips played; Bench Boost / Triple Captain values), `squadBuilder.ts` (Free Hit / Wildcard squads by repeated best transfers), `rotation.ts` (every club pair, weekly maximum, `rotationMinStarts`), `draftPlan.ts` (replays planned transfers with the Transfers page's rules, reports broken moves).
- `draftRepository.ts` — SQLite storage for the plan.
