# 006 — Planner and explained numbers

- **Status:** Done
- **Started:** 2026-10-25
- **Scope:** A Planner page (one draft transfer plan over the next 5 gameweeks, chip timing, rotation pairs), and every predicted number shown with what it adds up from
- **Builds on:** [003 — Predicted points](003-predicted-points.md), [004 — Next gameweek](004-next-gameweek.md), [005 — Transfer suggestions](005-transfer-suggestions.md). Phase 4 and "Explained, not a black box" (section 4) of the [recommendations roadmap](../tasks/recommendations-roadmap.md).

## Goal

Look past the next deadline, and stay checkable while doing it:
- **Draft plan:** plan transfers a few weeks ahead and see the predicted points follow.
- **Chips:** know when each chip is worth the most.
- **Rotation:** find pairs of clubs that cover each other's fixtures.
- **Explained:** be able to check any number: each prediction is shown as the formula the model used, and each recommendation as what it adds up from.

## Requirements

### R1. One draft plan
- Queue transfers over the next 5 gameweeks and see the predicted totals update. One draft only.

### R2. Chip timing
- Bench Boost: the gameweek with the highest predicted bench total.
- Triple Captain: the best captain, e.g. in a double gameweek.
- Free Hit: blank gameweeks.
- Wildcard: when the gap between your squad and the best possible squad is largest.

### R3. Rotation planner
- Every pair of goalkeepers or defences; the pair whose fixtures cover each other best.

### R4. Explained, not a black box
- Every number shows its breakdown (minutes × xG × fixture factor).

### R5. Page, storage and tests
- A Planner page; the draft is stored; end-to-end tests with mocked data.

## Done

- [x] **R1**: `planner/draftPlan.ts` replays the plan (`{ gameweek, outId, inId }[]`) week by week with the Transfers rules: like for like, budget (bank + selling prices), 3 per club, free transfers banked to 5 and −4 beyond them.
  - **Per week:** the best XI, armband and autosubs for the planned squad (the Next GW optimiser), the hit, bank, free transfers and the same with no transfers. GW one matches the Next GW page exactly.
  - **Suggestions:** each week also suggests the best single transfer for the rest of the horizon, if it beats saving (Transfers rules, incl. the 1.5-point banked-transfer value), with a one-click Add.
  - **Storage:** the `draft_plan` table (migration 6). `PUT /api/planner/draft` replaces the plan and rejects (400) a plan that breaks any rule, naming the move, e.g. "GW3: Delap would make 4 CHE players (max 3)". `DELETE` clears it.
  - **Stale plans:** on load, moves for past gameweeks and moves that no longer work (the player was sold for real, or left the league) are dropped with a warning.
  - **Chains** work (buy in GW3, sell the same player in GW4). Players bought in the plan keep today's price.
  - **Live check** (GW9): GET ~0.3 s. Adding the suggested Rogers → Mbeumo raised the plan by +6.35 over GW9–13.
- [x] **R2**: `planner/chips.ts` and `squadBuilder.ts`.
  - **Availability:** from `bootstrap-static` `chips` (each chip has a `start_event`–`stop_event` window; two per season since 2025-26) and the chips in `/entry/{id}/history/`. Without FPL's list, each chip is once per season. Only gameweeks inside the current window count.
  - **Bench Boost** = the best lineup's bench points − the autosub points already expected without it.
  - **Triple Captain** = the armband once more (vice-captain covering included). Double gameweeks win naturally: the mock's Arsenal double in GW5 picks Gabriel.
  - **Free Hit** = for each week, the best squad for that week alone from the same budget, minus yours. The explanation counts your players without a fixture.
  - **Wildcard** = the best squad for the whole horizon minus yours, per week and in total, shown with the players in and out. It's only suggested ("worth considering now") when it beats the Transfers page's recommendation by `wildcardMinGain` = 10 points (a rule of thumb, not measured).
  - **Squad search (changed from "best possible squad"):** no solver. From your squad it keeps making the best free transfer (singles first, pairs when no single helps, 15 candidates per position) until nothing adds points, so budget, positions and the club limit hold throughout. The result can't be improved by any 1 or 2 changes, but it isn't proven optimal.
  - **Live check** (GW9): Bench Boost best in GW12 (+10.3), Triple Captain GW11 (Haaland +7.0), Free Hit GW12 (+7.1). The Wildcard suggested now: +22.3 over GW9–13, 15.7 more than the best transfers, 10 changes.
- [x] **R3**: `planner/rotation.ts` tries every club pair (190), worth the sum of the better club each week.
  - **Values:** goalkeepers use each club's first-choice keeper's predicted points; defences use expected clean sheets (doubles count twice).
  - **Changed:** the first live run ranked "Arsenal + anyone" top, because Arsenal's keeper was best almost every week and the second keeper never started. So a pair only counts if each club is the better one in at least `rotationMinStarts` = 2 weeks, and goalkeeper pairs must cost ≤ `goalkeeperPairMaxPrice` = £10m. Live, that gives e.g. BHA + FUL (Verbruggen + Leno, £9.1m), +0.75 over the better one alone.
  - **Shown:** the total, the best single club and what rotating adds.
- [x] **R4**:
  - **Model inputs:** `projectFixture` now also returns its `inputs`: availability, start share, minutes per start, sub chance, 60-minute chance, the steadied rates per 90 (xG, xA, bonus, card points), opponent defence and attack, own defence, home factor, league goals per match, expected goals against, saves and defensive actions per match, the defensive-contribution threshold and chance, and FPL points per goal / assist / clean sheet. The model's arithmetic is unchanged: the backtest gives the same numbers as spec 003 (2025-26 MAE 1.91, baseline 1.98, played 60+ 2.30).
  - **Predictions page:** under each player's breakdown, pick a fixture to see every line as a formula, e.g. "Goals: 0.45 xG/90 × 76′/90′ × 1.12 LIV defence × 1.10 home = 0.38 xG × 4 pts … 1.53".
  - **Test:** an E2E test recomputes every line of every squad fixture from the inputs.
  - **Other pages:**
    - *Next GW:* the best and current totals as starters + armband + autosubs.
    - *Transfers:* each option shows the squad's points per gameweek before → after, and the hit and banked-transfer deductions down to the score (`squadPerGameweek` is new in the response).
    - *Planner:* each week's XI + armband + subs − hit; each chip value with its explanation and method.
- [x] **R5**:
  - **Endpoints:** `GET /api/planner` (cached as `planner:<id>`, `?refresh=true` skips it) and `GET/PUT/DELETE /api/planner/draft` (not cached).
  - **Page:** Planner (`#/planner`, after Transfers): draft plan, chips, rotation.
  - **Shared loader:** `transfers/transferContext.ts` (projections, squad at selling prices, bank, free transfers), used by Transfers and Planner.
  - **Migration 6:** `draft_plan`, and clears `response_cache` (projections gained `inputs`).
  - **Mock:** chip windows in `bootstrap-static`.
  - **Tests:** 23 new E2E tests (96 in total). They cover chip windows, chips played and the no-windows fallback, each chip's value against its explanation, Free Hit / Wildcard with added players (Wildcard only "worth it" with 4 upgrades when the best transfers can make 2), rotation totals, the goalkeeper budget, and the draft rules above. Plus the 401 checks for the four new routes.
  - **Speed:** cold `/api/planner` ~2.7 s live (6 squad searches), cached afterwards. Type-checked and built, but not checked in a browser.

## Known limitations

- **Horizon:** only the next 5 gameweeks are compared. A later double or blank gameweek (for Bench Boost, Triple Captain or Free Hit) isn't seen, so "best in GW12" means "best of GW9–13".
- **Squad search:** greedy local search, not an optimum. It can miss squads needing 3+ simultaneous changes to fund each other.
- **Chips together:** the planner doesn't combine chips (e.g. Wildcard then Bench Boost) or plan chips inside the draft plan.
- **Draft prices:** prices are assumed not to change, and the plan doesn't know about transfers already made for the next gameweek (hidden until the deadline, as in spec 005).
- **Thresholds:** `wildcardMinGain` (10) and `savedTransferValue` (1.5) are rules of thumb, not measured.
- **Rotation:** keepers are each club's first choice by predicted points, not by price. Defences are clubs, not specific players.

## Possible next steps

- [ ] Put chips in the draft plan (play Bench Boost in GW12 and see the total).
- [ ] Extend the horizon for chip timing beyond 5 gameweeks (cheap: the model doesn't depend on it).
- [ ] Measure `wildcardMinGain` / `savedTransferValue` with a season replay.
- [ ] Section 4 of the roadmap: mini-league effective ownership, and "your own record" (captain vs best option, transfers that paid off).
