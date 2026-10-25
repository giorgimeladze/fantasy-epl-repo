# planner/

`/api/planner` (chip timing + rotation pairs, cached under `planner:<id>`) and `/api/planner/draft` (GET/PUT/DELETE: the manager's one draft plan, stored in the `draft_plan` table, never response-cached). Both start from `transfers/transferContext.ts` (projections, squad at selling prices, bank, free transfers).

- `chips.ts` — pure: chip availability from `bootstrap-static` `chips` windows (once per season if missing) + chips played; Bench Boost (bench − expected autosubs) and Triple Captain (the armband once more) per gameweek via `nextGameweek/lineupOptimizer.ts`.
- `squadBuilder.ts` — pure: Free Hit / Wildcard squads by repeated best free transfers (singles, then pairs) with `transfers/transferSearch.ts`, until nothing adds points.
- `rotation.ts` — pure: every club pair, scored as the weekly maximum; each club must start `rotationMinStarts` weeks.
- `draftPlan.ts` — pure: replays planned transfers week by week (rules as on the Transfers page) and reports the moves that break one.
- `draftRepository.ts` — SQLite storage for the plan. `plannerService.ts` assembles both responses; PUT rejects (400) a plan with any broken move, GET drops them with a warning.
