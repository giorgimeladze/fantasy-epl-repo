# nextGameweek/

`/api/next-gameweek`: what to do with the lineup before the deadline, built from `projections/` (next gameweek's predicted points and play chances), cached under `next-gameweek:<id>`.

- `nextGameweekService.ts` — best XI vs the current lineup (via `shared/lineupOptimizer.ts`), changes, captain options, formations.
- `reasons.ts` — pure: the reason phrases under each player for one gameweek (helpers in `shared/playerReasons.ts`).
- `priceWatch.ts` — pure: FPL's own undocumented price-change outlook (`price_change_projections`, likelihood −5…5 per upcoming price update; locked prices skipped) and the squad / risers / fallers lists. `available: false` when FPL stops publishing it.

The comparison is against the current gameweek's picks, because FPL only shows next gameweek's picks after the deadline. Differentials come from `projections/`.
