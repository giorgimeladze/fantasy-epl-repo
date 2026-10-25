# shared/

Code used by two or more features. Never imports a feature's internals (only `models.ts` types and public services).

- `numbers.ts` — `round2` / `round3` (JSON-safe), `tenths` (FPL price → £m), `decimal` / `decimalOrNull` (FPL decimal strings), `sum`, `EPSILON`.
- `positions.ts` — `POSITIONS`, `byPosition`, `groupByPosition`, `positionFromCode` (`GKP` / `GK`), `isAvailable`.
- `lineupOptimizer.ts` — pure: tries every legal XI (7 formations, ~530 XIs from 15) and bench order; starters + captain (vice covers a no-show) + expected autosubs (Poisson-binomial). Used by nextGameweek/, planner/ and the transfer search.
- `playerReasons.ts` — pure: the reason phrases (availability, main point sources, head-to-head, venue).
- `decision/` — what a transfer or chip decision needs, for transfers/ and planner/:
  - `decisionContext.ts` — loads every player's projection, the squad at selling prices, bank, free transfers, chips played (`loadDecisionContext`); `noGameweeksLeft()`.
  - `transferSearch.ts` — pure: candidate pool and the exhaustive 0/1/2-transfer search (budget, 3 per club, like-for-like, −4 hits, a banked transfer worth `savedTransferValue`).
  - `transferOption.ts` — the Transfers page's search on a context (`searchFromContext`) and its response view (`transferOption`).
  - `freeTransfers.ts` — pure: replayed from `/entry/{id}/history/` (+1 a week, banked up to 5; Wildcard / Free Hit keep the bank).
  - `sellingPrices.ts` — pure: purchase price from `/entry/{id}/transfers/`, selling price = purchase + half of any rise, rounded down. Never `/my-team`.
  - `transferReasons.ts` — pure: reasons over the whole horizon (fixtures, form, availability, sources, head-to-head).
