# 003 — Predicted points

- **Status:** Done
- **Started:** 2026-10-18
- **Scope:** Predicted points for the next 5 gameweeks: FPL's own forecast on the dashboard, our own explainable model, double/blank gameweeks, and a backtest against last season
- **Builds on:** [002 — Head-to-head page](002-head-to-head.md). Phase 1 of the [recommendations roadmap](../tasks/recommendations-roadmap.md).

## Goal

A predicted-points number for every player for each upcoming gameweek, with a breakdown that shows where the points come from. This is the base for the lineup, captain and transfer suggestions in later phases, so it has to be measurable: we check it against last season instead of trusting it by feel.

## Requirements

### R1. FPL's forecast on the dashboard
- Show FPL's own next-gameweek forecast (`ep_next`) for every squad player on My team.

### R2. Our own model
- For every Premier League player, predicted points per gameweek for the next 5 gameweeks.
- Built from: chance of playing, expected minutes (starts and minutes per start), xG and xA per 90, clean-sheet chance, goals conceded, saves, bonus, defensive contributions and cards, scored with FPL rules for the player's position.
- The fixture's difficulty comes from club attack and defence strength worked out from xG, plus home advantage, not just the 1–5 FDR.
- Early-season numbers are steadied with last season's per-90 rates, or position averages for players with no history.
- A small head-to-head adjustment: how the player has scored against this opponent compared with their usual average.
- Each prediction comes with its breakdown (appearance, goals, assists, clean sheet, …).

### R3. Double and blank gameweeks
- Fixtures are grouped by gameweek: a double gameweek adds both fixtures, a blank gameweek is 0 and shown as a blank.

### R4. Backtest
- Run the model over the most recent past season in SQLite: predicted vs actual points, error per position, compared with FPL's own forecast and a simple points-per-game baseline.

### R5. Page, caching and tests
- A Predictions page: the squad with predictions per gameweek and the breakdown, plus the top predicted players per position.
- Cached in SQLite for 30 minutes with a Refresh button, like the other pages.
- Mocha tests with mocked data for the model, the service, the backtest and the endpoint.

## Done

- [x] **R1**: an **xP** column (FPL's `ep_next`) in the My team stats table.
  - Finding: for 406 of the 442 players who had played by GW7 of 2026-27, `ep_next` is exactly their FPL form (average points over the last 30 days). Clubs that played once in that window show ~1.0 (e.g. Saka, Ødegaard, B.Fernandes). It's a weak forecast, so it is shown for comparison only.
- [x] **R2**: a pure model in `projectionModel.ts`, fed by `projectionService.ts`, predicts every player for the next 5 gameweeks:
  - **Minutes:** start chance = availability × share of the club's matches started. Availability comes from FPL's flags and recovers over ~3 GWs. Minutes per start sets the chance of 60+ minutes. Outfield non-starters get a small chance of a sub appearance.
  - **Fixture:** the live API's club `strength_attack/defence_*` fields are all 0 this season, so club strength is worked out from xG: attack = club xG per match, defence = its goalkeepers' xG conceded per match, both relative to the league and steadied with 6 matches of league average. Home advantage is ×1.1.
  - **Scoring:** expected goals and assists (per 90 × minutes × opponent defence), clean-sheet chance (Poisson from the opponent's expected goals), goals conceded and saves (expected value of the "per 2" and "per 3" rules), bonus, defensive contribution (chance of reaching 10 or 12 actions) and cards. All use FPL 2025-26 points for the player's position.
  - **Steadying:** per-90 rates are blended with last season's (from 450+ minutes) or position averages, worth 900 minutes. The start share is blended with last season's.
  - **Head-to-head:** factor on goals, assists and bonus from the last 4 meetings vs the player's average in past seasons; at least 2 meetings, max ±15 %, default weight 0.3 (≈ ±4.5 % in practice).
  - **Breakdown:** every fixture comes with a breakdown per scoring rule, expected minutes, start chance, clean-sheet chance, xG, xA and the head-to-head factor.
- [x] **R3**: fixtures are grouped by gameweek: a double gameweek adds both fixtures, a blank gameweek has none and 0 points.
- [x] **R4**: `npm run backtest [-- <season>]` replays a past season from SQLite, scoring GW4 onwards with only what was known before each gameweek, on players who played in one of their club's last 3 gameweeks. Results (MAE = mean absolute error, points per player per gameweek):

  | Season | Model | Season average | FPL xP (same GWs) | Played 60+: model / FPL |
  | --- | --- | --- | --- | --- |
  | 2025-26 | **1.91** | 1.98 | 1.86 vs **1.45** (GW4–6 only) | 2.30 / **1.94** |
  | 2024-25 | 1.81 | 1.81 | 1.81 vs **1.48** | 2.23 / **1.99** |

  - The model beats the season-average baseline for GK, MID and FWD in both seasons. Defenders were over-predicted in 2024-25 (bias +0.33).
  - FPL's historical xP does better. Part of that is team news: it's ~0.2 for players who then didn't play, and the dataset has no availability flags to give the model. Even on players who played 60+ minutes, FPL is still ahead, so there is room to improve.
  - **Head-to-head:** weights from 0 to 2 change MAE by ≤ 0.003 in 2023-24, 2024-25 and 2025-26 (RMSE gets slightly worse). Past meetings with a club add almost nothing to the prediction, so the weight stays small.
  - Past seasons now also store each player's position, starts and FPL's xP (migration 3; the seasons are downloaded again once).
- [x] **R5**:
  - **Predictions page** (`#/predictions`):
    - The squad with FPL's forecast, predicted points per gameweek (fixture chips, Blank for blanks, two chips for doubles) and the total, with filters (all / XI / bench) and sorting (squad / next GW / total).
    - Clicking a player opens the breakdown per fixture.
    - Below: the top 10 per position across the league, ★ for squad players.
  - **Endpoint:** `GET /api/projections`, cached in `response_cache` for 30 minutes, `?refresh=true` skips the cache. Live check: ~0.7 s fresh, ~10 ms cached.
  - **Tests:** 41 new Mocha tests (132 in total) for the model, service, backtest, repository queries, importer columns and the endpoint. The mocks now include a double gameweek (Arsenal, GW5) and a blank (Man City, GW5).

## Known limitations

- **Recent form:** start share and minutes come from season totals, so a player recently dropped to the bench still looks like a regular until FPL flags them. Recent appearances aren't used.
- **Injuries:** players are assumed to recover over ~3 gameweeks. FPL's news text (e.g. "expected back 1 Nov") isn't read.
- **Early season:** club strength starts from the league average, not last season's. Promoted clubs and the first gameweeks are rough.
- **Penalties, set pieces and own goals** aren't modelled separately. Penalty takers' xG already includes them.
- **Backtest:**
  - It assumes everyone is available (the dataset has no flags), so it understates what the live model can do.
  - Positions, starts and xP come from the vaastav dataset. Its xP has gaps (0 for everyone from GW7 of 2025-26).
- **Ranking:** the model is scored on point error only; ranking quality (does it pick the best players?) isn't measured yet.
- **Probabilities:** predictions are expected values; there is no range or "chance of a haul" yet.

## Possible next steps

- [ ] Use each squad player's recent matches (FPL `element-summary`) for start chance and minutes.
- [ ] Steady club strength with last season's xG (by club `code`) at the start of a season.
- [ ] Tune the defender clean-sheet / defensive-contribution numbers (over-predicted in 2024-25) and score ranking quality in the backtest.
- [ ] Read return dates from FPL's injury news.
- [ ] Phase 2 of the [roadmap](../tasks/recommendations-roadmap.md): best XI, captain and bench order from these predictions.
