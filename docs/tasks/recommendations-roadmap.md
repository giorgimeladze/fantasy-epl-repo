# Recommendations roadmap (next GW, lineup, transfers)

- **Written:** 2026-10-17
- **Source:** review of [Fantasy Football Fix](https://www.fantasyfootballfix.com/) ([premium features](https://www.fantasyfootballfix.com/premium), [rotation tool](https://www.fantasyfootballfix.com/blog-index/go-head-head-our-new-fixture-rotation-tool/)) against this codebase.
- **Status:** Phase 1 done ([spec 003](../specs/003-predicted-points.md)); Phases 2 and 5 done ([spec 004](../specs/004-next-gameweek.md)). Phases 3–4 are backlog. When work starts on one, turn it into a numbered spec in [../specs/](../specs/) and link it here.

The goal: recommendations for the **next gameweek**: who to start, bench and captain, and who to transfer in and out. Only free data (the FPL API and the vaastav history we already import).

## 1. What Fantasy Football Fix offers

FFFix does not say how its algorithms work, so treat this list as features to take ideas from, not designs to copy.

- **Assistant Manager / AI transfers:** best transfer for your team each gameweek, plus bench order and captain advice.
- **Points projections:** predicted points per player for upcoming gameweeks.
- **Future Gameweek Planner:** up to 5 draft versions of your team for planning transfers and chips ahead.
- **AI Rotation Planner:** picks clubs whose fixtures cover each other best, using attack and defence strength.
- **Price change predictor.**
- **Elite XI / Captain Reveal / transfer data before the deadline:** what top-10k managers buy and captain.
- **Opta stats sandbox and ChatFPL:** advanced stats and an AI chatbot.

## 2. What we already have

- Squad dashboard: form, xG/xA, ICT, availability news, the next 5 fixtures with FDR (`teamService`, `fplMappers.upcomingFixturesByTeam`).
- "Points for me" with captaincy, autosubs and chips applied (`pointsCalculator`).
- Head-to-head: last 4 meetings with the next opponent over 4 seasons, plus a scout for any player (`headToHeadService`, `headToHeadInsights`). **FFFix has nothing like this.**
- Past seasons' match data in SQLite (`player_fixture_history`): the dataset for building and testing a points model.

## 3. What to implement, in order

### Phase 1: Predicted points (everything else depends on it): done, see [spec 003](../specs/003-predicted-points.md)

- [x] **Quick win:** FPL's `ep_next` as an xP column on My team. *Turned out to be FPL form for ~92 % of players, so it's for comparison only.*
- [x] **Our own model:** pure `projectionModel.ts` + `projectionService.ts`, per player and GW for the next 5 GWs:
  - [x] **Chance of playing:** from `chance_of_playing_next_round` and `status`, recovering over ~3 GWs.
  - [x] **Expected minutes:** from the season's start share and minutes per start. *Recent appearances aren't used yet (next step in spec 003).*
  - [x] **Goals and assists:** xG and xA per 90 × minutes × opponent defence, scored with FPL points for the position.
  - [x] **Clean sheets and goals conceded:** Poisson from the opponent's expected goals.
  - [x] **Appearance, bonus, saves, defensive contributions and cards:** from the player's own rates, steadied with last season.
  - [x] **Fixture factor:** *changed:* the live API's `strength_attack/defence_*` fields are 0 this season, so club attack and defence come from xG for and against.
  - [x] **Head-to-head adjustment:** small weight. *Finding: it makes no measurable difference in the backtest (MAE ±0.003), so it stays small.*
- [x] **Double and blank gameweeks:** fixtures grouped by gameweek.
- [x] **Check the model:** `npm run backtest`. It beats the season-average baseline. FPL's historical xP is still more accurate, partly because it knows team news (results table in spec 003).
- [x] **Cache:** `GET /api/projections` in `response_cache` for 30 minutes.

### Phase 2: Lineup for the next gameweek: done, see [spec 004](../specs/004-next-gameweek.md)

- [x] **Best XI:** all 7 formations, searched exhaustively (~530 XIs × 6 bench orders). *Better than planned: it also counts automatic substitutions and the vice-captain covering, so a doubtful player is valued with his cover.*
- [x] **Bench order:** backup GK first, then the outfield order that gets the most from autosubs.
- [x] **Captain / vice-captain:** the pair adding the most points; top 3 options shown with their play chance.
- [x] **Compare with your current picks:** "Start X instead of Y: +n", captain change and bench order. *Against the current GW's picks: FPL hides next GW's picks until the deadline.*
- [x] **New "Next GW" page** (`#/next-gw`) with a reason line for every player.

### Phase 3: Transfer suggestions

- [ ] **Free transfers:** worked out from `/entry/{id}/history/` (`event_transfers` and chips per GW; banking up to 5).
- [ ] **Selling prices:** estimated from `/entry/{id}/transfers/`: purchase price + half of any rise, rounded down to £0.1m. Avoid `/my-team`, which needs your FPL login.
- [ ] **Rules:** budget (bank + selling price), max 3 players per club, position quotas.
- [ ] **Search:** 0, 1 and 2 transfers, checked exhaustively over the top ~30 candidates per position by predicted points over 3–5 GWs. Fast enough without a solver.
- [ ] **Hits:** suggest a −4 only if the predicted gain over the planning horizon beats 4 points.
- [ ] **Show "save the transfer" as an option:** often the right call with banking.
- [ ] **Output:** "Sell A → buy B, +X predicted points over 5 GWs, £Y left", with the breakdown (fixtures, form, availability, head-to-head).

### Phase 4: Planning ahead

- [ ] **One draft plan:** queue transfers over the next 5 GWs and see predicted totals update. FFFix allows 5 drafts; one is enough for us at first.
- [ ] **Chip timing:**
  - Bench Boost: the GW with the highest predicted bench total.
  - Triple Captain: the best captain in a double GW.
  - Free Hit: blank GWs.
  - Wildcard: when the gap between your squad and the best possible squad is largest.
- [ ] **Rotation planner:** try every pair of GKs or defences (20×19 club pairs) and pick the one whose fixtures cover each other best.

### Phase 5: Easy extras from the same FPL data: done, see [spec 004](../specs/004-next-gameweek.md)

- [x] **Price-change hint:** *changed:* FPL now publishes its own price-change outlook (`price_change_projections`, `price_change_percent`), so the hint uses that instead of guessing from transfers. Net transfers are still shown.
- [x] **Differentials:** outside the squad, under 10% owned, top 5 per position by predicted points over 5 GWs.

## 4. Do better than FFFix for this app's single manager

- [ ] **Your mini-league instead of the top 10k:** `/leagues-classic/{id}/standings/` and rivals' `/entry/{id}/event/{gw}/picks/` are public. Show **effective ownership in your league**, who rivals captain, and which differentials gain on the leader. More useful than elite data for winning a mini-league, and only ~10–20 requests.
- [ ] **Your own record:** we already have past picks and "points for me". Add "your captain vs the best option each GW" and "transfers that paid off", to tune how much risk you take.
- [x] **Head-to-head as a model input:** FFFix doesn't use player-vs-opponent history. Use it with a small weight and show it as a reason ("good record vs WOL"). *Done (003/004); the backtest shows it adds almost nothing.*
- [ ] **Explained, not a black box:** every number shows its breakdown (minutes × xG × fixture factor). With one team to manage, being able to check the reasoning matters more than an "AI" score.
- [ ] **Light on the FPL API:** cache projections per GW and reuse the history already in SQLite. Never call FPL from the browser.

## 5. What not to implement (or leave until much later)

- **Opta stats and heatmaps:** paid data. FPL's xG/xA/xGI/ICT/defensive-contribution fields are enough.
- **ChatFPL-style chatbot:** not before the numbers exist. Later, Claude could explain recommendations in plain English from the computed breakdowns, never inventing numbers.
- **Elite XI / top-10k team reveals:** you would have to crawl thousands of teams; rate-limit risk for little gain over mini-league data.
- **Exact price-change predictor:** needs the full ownership flows across all managers, which the public API doesn't give. A simple hint is the most we should do.
- **Many draft plans / multiple squads:** extra UI with little value for one manager.
- **Logging in to FPL** (for `/my-team`, exact selling prices and free transfers): storing FPL credentials goes against the app's minimal security setup; estimates are good enough.
- **ILP / LP solvers:** not needed for 0–2 transfers with pruned candidates. Only reconsider for the wildcard or season-long planning.

## 6. Proposed first spec

`003-recommendations.md` = Phase 1 (`ep_next` + our model, tested against last season) + Phase 2 (Next GW page: best XI, captain, bench order) + up to 2 suggested transfers from Phase 3. Phases 4–5 and the mini-league features go in later specs.
