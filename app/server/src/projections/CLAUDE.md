# projections/

`/api/projections`: predicted points for the next `config.projections.gameweeks` gameweeks — the squad, the top players per position and differentials (outside the squad, owned by < `config.projections.differentialMaxOwnership` %). Each fixture and gameweek also has a `playChance`, which `nextGameweek/` uses for captaincy and automatic substitutions.

- `projectionModel.ts` — pure model: FPL scoring rules, club attack/defence strength, expected minutes from starts and availability, and a small head-to-head nudge (±15 %). Every prediction comes with a breakdown that adds up to its points, and the `inputs` behind each line (rates per 90, opponent and venue factors, goals against, …) so the client can show it as a formula. Add an input there when the model gains one.
- `leagueProjection.ts` — pure: runs the model for every player and fixture in the horizon (doubles add up, blanks are 0), from bootstrap, fixtures, last season's totals and head-to-head averages.
- `projectionService.ts` — loads those inputs from FPL and `history/`; the squad, top players and differentials (`/api/projections`), and every player uncached (`getLeagueProjections`, for transfers/planner).
- `backtest.ts` — pure: replays a past season through the model; run with `npm run backtest [-- <season>]` (`scripts/backtest.ts`).

After changing the model, follow the `model-change` skill (backtest, record the numbers in the active spec).
