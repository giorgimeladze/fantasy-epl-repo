# headToHead/

`/api/head-to-head`: each player's last `config.history.matchesPerPlayer` matches against their next opponent, across this season (live FPL element summaries) and past seasons (`history/`).

- `headToHeadService.ts` — squad view, single-player scout (`/players/:id`) and picker options (`/options`). `analysePlayer` is shared by the squad and scout views, so both always agree.
- `headToHeadInsights.ts` — pure: match result, what earned or cost points per position, summary and verdict (good ≥ 6 avg, poor < 3).
- `models.ts` — `FixtureRecord` (one player in one past match, also used by `history/` and `projections/`) and the response types.

Opponents are matched by club `code`, not `id`. Matches with 0 minutes are skipped.
