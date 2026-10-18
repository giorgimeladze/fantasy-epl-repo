# nextGameweek/

`/api/next-gameweek`: what to do with the lineup before the deadline, built from `projections/` (next gameweek's predicted points and play chances).

- `lineupOptimizer.ts` — pure: tries every legal XI (7 formations, ~530 XIs from 15) and every bench order. Each is scored as starters + captain (the vice-captain covers a captain who doesn't play) + expected automatic substitutions (Poisson-binomial over outfield no-shows; formation limits on subs ignored). Also pairs the "start X instead of Y" changes.
- `reasons.ts` — pure: the short reason phrases under each player (fixture, chance to play, main point sources, head-to-head).
- `priceWatch.ts` — pure: FPL's own undocumented price-change outlook (`price_change_projections`, likelihood −5…5 per upcoming price update; locked prices are skipped). `available: false` when FPL stops publishing it.
- `nextGameweekService.ts` — assembles the response; cached under `next-gameweek:<id>`.

The comparison is against the current gameweek's picks, because FPL only shows next gameweek's picks after the deadline. Differentials come from `projections/` (`differentials` in its response).
