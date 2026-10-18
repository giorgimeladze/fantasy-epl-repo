# projections/

`/api/projections`: predicted points for the next `config.projections.gameweeks` gameweeks — the squad plus the top players per position.

- `projectionModel.ts` — pure model: FPL scoring rules, club attack/defence strength, expected minutes from starts and availability, and a small head-to-head nudge (±15 %). Every prediction comes with a breakdown that adds up to its points.
- `projectionService.ts` — gathers inputs from FPL and `history/` and runs the model per fixture (doubles add up, blanks are 0).
- `backtest.ts` — pure: replays a past season through the model; run with `npm run backtest [-- <season>]` (`scripts/backtest.ts`).

After changing the model, run the backtest and record the numbers in the active spec in `docs/specs/`.
