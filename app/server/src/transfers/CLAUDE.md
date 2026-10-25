# transfers/

`/api/transfers`: who to sell and buy before the next gameweek (0, 1 or 2 transfers), built from every player's projection (`projectionService.getLeagueProjections`) over the next `config.projections.gameweeks` gameweeks.

- `freeTransfers.ts` — pure: free transfers replayed from `/entry/{id}/history/` (+1 a week, banked up to 5; Wildcard / Free Hit keep the bank as it was).
- `sellingPrices.ts` — pure: purchase price from `/entry/{id}/transfers/` (first-squad players: the season's starting price), selling price = purchase + half of any rise, rounded down. Never `/my-team` (needs the FPL login).
- `transferSearch.ts` — pure: candidate pool (top `candidatesPerPosition` per position, affordable, not clearly beaten on price and points) and the exhaustive 0/1/2-transfer search. Squads are scored per gameweek as a greedy best XI + armband + autosubs (reusing `nextGameweek/lineupOptimizer.ts`). Rules: budget, max 3 per club, like-for-like positions, −4 per extra transfer, and a banked free transfer is worth `savedTransferValue` points.
- `reasons.ts` — pure: fixtures over the horizon, form, availability, point sources, head-to-head (helpers from `nextGameweek/reasons.ts`).
- `transferContext.ts` — loads the shared inputs (every player's projection, squad at selling prices, bank, free transfers); also used by `planner/`.
- `transferService.ts` — assembles the response; cached under `transfers:<id>`. `searchFromContext` is the same search for `planner/`.
