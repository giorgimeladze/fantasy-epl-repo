---
name: model-change
description: Change the predicted-points model (projections/projectionModel.ts) and measure it with the backtest. Use when touching projection rules, weights or inputs.
---

# Changing the prediction model

1. Rules live in `app/server/src/projections/projectionModel.ts` (pure). `leagueProjection.ts` feeds it per player and
   fixture; `projectionService.ts` only loads inputs.
2. Every prediction carries a `breakdown` that adds up to its points and the `inputs` behind each line. A new factor
   gets an input in `FixtureInputs` (`projections/models.ts`), and a line in the client's
   `components/FixtureExplanation.tsx` so it shows as part of the formula.
3. Measure before and after:
   ```bash
   npm run backtest              # latest past season in SQLite (downloads history once)
   npm run backtest -- 2024-25   # a given season
   ```
   Record both runs (MAE, RMSE, bias; overall and "played 60+") in the active spec. A change that makes the numbers
   worse needs a reason in the spec.
4. The projections response changed shape? Clear the cache in a migration (`db-migration` skill).
5. Update the hand-calculated expectations in `test/projections.test.ts`, then `npm run check`.
