# 004 — Next gameweek: best XI, captain and extras

- **Status:** Done
- **Started:** 2026-10-18
- **Scope:** A Next GW page that picks the best starting XI, bench order and captain from the predictions, compares it with the current lineup, and adds price-change and differential hints
- **Builds on:** [003 — Predicted points](003-predicted-points.md). Phases 2 and 5 of the [recommendations roadmap](../tasks/recommendations-roadmap.md).

## Goal

Answer "what should I do before the deadline?" for the lineup: which XI, which formation, who on the bench in which order, and who to captain, all from the predicted points, and each with a reason. Add the cheap extras from the same FPL data: whose price is about to change, and which low-owned players are predicted to score well.

## Requirements

### R1. Best XI
- Try every legal formation (3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-3-2, 5-4-1) and pick the starting XI with the highest predicted points for the next gameweek.
- Count everything that affects the score: each player's chance of playing, automatic substitutions from the bench, and the captain's double points (with the vice-captain as cover).
- Show the predicted total for each formation.

### R2. Bench order
- Backup goalkeeper first, then outfield players in the order that gets the most points from automatic substitutions.

### R3. Captain and vice-captain
- The pair that adds the most predicted points, allowing for the vice-captain taking over when the captain doesn't play.
- The top 3 captain options with their predicted points and chance of playing.

### R4. Compare with the current lineup
- The current lineup's predicted total for the same gameweek, and the changes: "Start X instead of Y: +n", captain change and bench order.

### R5. Reasons
- A short reason line for every suggested player: fixture(s), chance of playing and news, where the points come from, head-to-head.

### R6. Price watch
- Squad players whose price is likely to rise or fall soon, and the league's likeliest risers and fallers, from FPL's own price-change data.

### R7. Differentials
- Players owned by under 10 % of managers with the highest predicted points, per position.

### R8. Page, caching and tests
- A Next GW page, cached like the other pages with a Refresh button. End-to-end tests with mocked data.

## Done

- [x] **R1**: `nextGameweek/lineupOptimizer.ts` searches every legal XI (7 formations, ~530 XIs from a 15-man squad) and every outfield bench order.
  - **Score:** each lineup is scored as starters' predicted points + armband + expected automatic substitutions, so a doubtful starter is valued together with the bench player who would replace him.
  - **Ties** go to the lineup whose starters score more directly.
  - **Formations:** every one is listed with its best predicted total.
- [x] **R2**: backup goalkeeper first, then the outfield order with the most expected autosub points. It uses the Poisson binomial of outfield no-shows; formation limits on substitutions are ignored.
- [x] **R3**: the captain / vice-captain pair adding the most: captain's points + (chance the captain misses) × vice's points.
  - If the captain is certain to play, the vice is the best-scoring other starter (found in the live check, where Haaland's 100% made a goalkeeper vice-captain).
  - The top 3 captain options show the armband value and play chance.
- [x] **R4**: compared with the **current** gameweek's picks, since FPL only shows next gameweek's picks after the deadline.
  - Swaps are paired like for like first (a keeper for a keeper), then the formation change. Also shown: the captain change, the new bench order and the overall difference.
  - Under +0.5 the page says the current lineup is fine too.
- [x] **R5**: `reasons.ts` writes the reason phrases for each player:
  - Fixture, or "Double gameweek: …" / "No fixture in GW n".
  - FPL's own availability flag with the news, or "rotation risk" when the model's play chance is under 75%.
  - The two biggest sources of points.
  - Good or poor head-to-head record.
- [x] **R6**: FPL started publishing its own price-change outlook in `bootstrap-static` (`price_change_projections`: a likelihood from −5 to 5 per upcoming nightly update, `price_change_percent`, `price_change_locked_until`), so the hint uses that instead of estimating from transfers.
  - Rules: |likelihood| ≥ 3 = likely, 2 = possible; locked prices are skipped.
  - Lists: your squad (likely and possible) and the league's 8 likeliest risers and fallers.
  - If the fields disappear, the page says FPL isn't publishing price data.
- [x] **R7**: `projections/` now also returns `differentials`: players outside the squad owned by under 10%, the top 5 per position by predicted points over 5 GWs, shown with their ownership.
- [x] **R8**:
  - **Page:** Next GW (`#/next-gw`), the second nav item. It has summary tiles, what to change, the XI on a pitch with armbands, the bench in order, captain options, a reasons table, formations, price watch and differentials.
  - **Endpoint:** `GET /api/next-gameweek`, cached as `next-gameweek:<id>` for 30 minutes, `?refresh=true` skips the cache.
  - **Projections:** now also include `playChance` (fixture and gameweek), `selectedByPercent` and `chanceOfPlaying`. Migration 5 clears the response cache.
  - **Tests:** 19 new E2E tests (63 in total) for the endpoint and the new projection fields. Scenarios include an injured player, a doubtful captain, a blank/double gameweek, a goalkeeper swap with a formation change, and FPL dropping its price data.
  - **Live check** (GW8, real team): built in ~0.8 s.
    - Best XI 3-5-2 = 50.5 vs current 3-4-3 = 50.1. The changes were Buendía for Barry, Hall for Mitchell and Kelleher for Leno; captain Haaland, vice Calafiori.
    - Price watch filled in from FPL's data.
    - Checked in Chrome at desktop and phone width: no console errors, no horizontal scroll.
- Model note: ignoring a tiny prior season for the start share (players with < 450 minutes last season) was tried, to fix a regular keeper getting a 51% play chance in the mock season. The backtest was unchanged in 2025-26 and 0.01 worse in 2024-25, so it was reverted.

## Known limitations

- **Hidden transfers:** the comparison uses the current gameweek's picks. Transfers already made for next gameweek aren't visible until the deadline, so the suggested XI may include a player you've sold.
- **Autosub rules:** formation limits are ignored (e.g. a sub that would leave only 2 defenders is still counted), and players are treated as independent.
- **Captaincy:** it uses expected points only; there's no "safe vs differential" captain choice or effective-ownership view.
- **Chips:** Bench Boost and Triple Captain aren't considered.
- **Price data:** FPL's price-change fields are undocumented. The reading of "offset" as one nightly update and the likelihood thresholds are our interpretation.
- **Play chance:** the model's play chance is close to 100% for nailed starters, so the vice-captain rarely adds anything; this follows from the model's minutes estimate (spec 003 limitations).

## Possible next steps

- [ ] Respect formation limits in the autosub calculation.
- [ ] Chip advice: Bench Boost / Triple Captain gameweek from these numbers (roadmap Phase 4).
- [ ] Transfer suggestions using the same optimiser on candidate squads (roadmap Phase 3).
- [ ] Captain choice with mini-league effective ownership (roadmap section 4).
