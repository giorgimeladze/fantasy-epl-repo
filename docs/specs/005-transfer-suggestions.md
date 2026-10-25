# 005 — Transfer suggestions

- **Status:** Done
- **Started:** 2026-10-25
- **Scope:** A Transfers page that suggests the best 0, 1 or 2 transfers for the next gameweek from the predictions, with free transfers, selling prices and the budget worked out from public FPL data
- **Builds on:** [003 — Predicted points](003-predicted-points.md) and [004 — Next gameweek](004-next-gameweek.md). Phase 3 of the [recommendations roadmap](../tasks/recommendations-roadmap.md).

## Goal

Answer "who should I sell and buy before the deadline?": the transfer (or pair) that adds the most predicted points over the next gameweeks, within the real FPL rules. It should say when a −4 hit pays for itself and when saving the transfer is the better call. Each suggestion is explained, and nothing needs the manager's FPL login.

## Requirements

### R1. Free transfers
- Worked out from `/entry/{id}/history/` (`event_transfers` and chips per gameweek), banking up to 5.

### R2. Selling prices
- Estimated from `/entry/{id}/transfers/`: purchase price plus half of any rise, rounded down to £0.1m. Not from `/my-team`, which needs the FPL login.

### R3. Rules
- Budget (bank + selling prices), max 3 players per club, position quotas.

### R4. Search
- 0, 1 and 2 transfers, checked exhaustively over the top ~30 candidates per position by predicted points over the horizon. No solver.

### R5. Hits and saving
- Suggest a −4 only if the predicted gain over the horizon beats it. Show "save the transfer" as an option.

### R6. Output
- "Sell A → buy B, +X predicted points over 5 GWs, £Y left", with a breakdown: fixtures, form, availability, head-to-head.

### R7. Page, caching and tests
- A Transfers page, cached like the other pages with a Refresh button. End-to-end tests with mocked data.

## Done

- [x] **R1**: `transfers/freeTransfers.ts` replays the season. The first squad is free, then each gameweek gives `min(5, max(0, free − made) + 1)`.
  - **Chips:** Wildcard and Free Hit keep the count unchanged, with no +1 that week. That is FPL's rule since 2024-25: "4 free transfers before a GW29 Free Hit → still 4 in GW30".
  - **History:** shown per gameweek on the page.
- [x] **R2**: `transfers/sellingPrices.ts` takes the purchase price from the latest transfer bringing the player in. Transfers in Free Hit weeks are ignored, because that squad is handed back.
  - **First-squad players:** priced at the season's starting price, `now_cost − cost_change_start`. This is exact for managers who started in GW1.
  - **Bank:** from the latest gameweek in the history.
- [x] **R3**: transfers are like for like, so the position quotas always hold.
  - **Budget:** bank + selling prices − buying prices ≥ 0.
  - **Club limit:** checked for the clubs of incoming players only, so a squad already over the limit elsewhere (the mock league has 4 clubs) still works.
- [x] **R4**: `transfers/transferSearch.ts` runs the search.
  - **Candidates:** per position, players outside the squad that the most money a sale could free can afford (bank + the 2 highest selling prices). Anyone beaten on both price and points by 3 others is skipped, then the top `candidatesPerPosition` (30) by horizon points are kept.
  - **Combinations:** every single (15 × 30) and every pair (~100 pairs out × up to 900 pairs in).
  - **Squad score:** each squad is scored per gameweek with the Next GW functions: starters + armband (`bestCaptaincy`) + expected autosubs (`autosubPoints`). The XI is picked greedily: best keeper, the formation minimums, then the 4 best outfielders. With a 2-5-5-3 squad that gives the most starter points.
  - **Speed:** ~0.4 s on the live league over 5 gameweeks (2.4 s from cold, including the FPL downloads).
- [x] **R5**: each option has a `score`.
  - **Formula:** `score = gain − 4 × transfers beyond the free ones − savedTransferValue × (free transfers next week if saving − free transfers next week after this option)`. Saving scores 0, and the highest score is recommended (ties go to fewer transfers).
  - **Banked transfer value:** `savedTransferValue` = 1.5 points. It is a rule of thumb, not measured.
  - **Effect:** with 1 free transfer, a move must gain 1.5 to beat saving, and a pair must gain 5.5 (4 for the hit + 1.5) and also beat the best single. With 5 banked, one transfer gives nothing up.
  - **Pairs:** only listed when they gain more than either of their moves alone, so the pair list isn't "best single + a filler swap".
- [x] **R6**: each option shows the moves as "Sell A → buy B", plus:
  - **Points:** the squad gain over the horizon (and per gameweek), the hit, the money left and the free transfers next week.
  - **Per player:** predicted points per gameweek and a reason line (`transfers/reasons.ts`): fixtures per gameweek (blank / doubles), FPL form, availability (shared with Next GW), the biggest point sources and head-to-head.
  - **Head-to-head phrasing:** shared `headToHeadReasons` now groups opponents: "good record vs MUN, SUN". This also changes the Next GW wording when a player has two notable opponents in a double gameweek.
- [x] **R7**:
  - **Endpoint:** `GET /api/transfers`, cached as `transfers:<id>` for 30 minutes; `?refresh=true` skips the cache.
  - **Page:** Transfers (`#/transfers`), the third nav item. It has tiles (free transfers, bank, squad points, best move), the recommendation with why it beats saving (or why saving wins), the best single transfers and pairs (toggle), selling prices and the free-transfer history.
  - **Projections:** `projectionService.getLeagueProjections` gives every player's projection, uncached; the transfer response is what's cached.
  - **Mock data:** `/entry/{id}/history/` and `/entry/{id}/transfers/` (Isak → Jackson for £7.2m in GW2) and `cost_change_start` (Saka, Palmer, Haaland).
  - **Tests:** 16 new E2E tests (73 in total). They cover banking to 5, hits, Wildcard / Free Hit, never calling `/my-team`, rises and falls in selling prices, no legal move → save, budget, 3 per club, rolling vs using with 1 vs 5 banked, the −4 only when both moves gain > 4, two free transfers, pairs where one move adds nothing, and caching.
  - **Live check** (GW9, real team): 1 free transfer, £0.2m in the bank. The recommendation was Rogers → Mbeumo, +6.6 over GW9–13, £0.0m left. The best pair (Cunha → Mbeumo, Rogers → Gibbs-White) gains +10.1 but scores lower after the −4. The page was type-checked and built, but not checked in a browser.

## Known limitations

- **Hidden transfers:** like spec 004, transfers already made for the next gameweek only appear after the deadline. Free transfers, bank and squad are as of the current gameweek.
- **Selling prices** for first-squad players of managers who joined after GW1 use the season's starting price, not the price on the day they joined.
- **Special FPL events** aren't modelled, such as the 2025-26 top-up to 5 free transfers before GW16, or an unlimited-transfer window.
- **Squad score:** the greedy XI ignores how captaincy and autosubs would change the choice of XI, so numbers can differ slightly from the Next GW page's full search. Every gameweek in the horizon counts equally, with no discount for later uncertainty.
- **Planning:** one gameweek at a time. Transfers planned for later gameweeks (and their banked value) are only approximated by `savedTransferValue`.
- **Chips:** Wildcard and Free Hit squads aren't suggested.

## Possible next steps

- [ ] Measure `savedTransferValue` (e.g. replay past seasons with "roll" vs "use" policies) instead of a rule of thumb.
- [ ] Discount later gameweeks in the horizon, or tune the horizon length with the backtest.
- [ ] Multi-week draft plan (roadmap Phase 4), reusing `searchTransfers` per gameweek.
- [ ] Wildcard squad: needs a solver or a much smarter search (roadmap section 5).
