# CONTEXT.md

Background knowledge for working on this project.

## What this is

A personal dashboard for one Fantasy Premier League (FPL) manager. A single admin logs in and sees their current 15-man squad with form, upcoming fixtures and how many points each player has earned for them this season.

## FPL rules that matter here

- **Squad**: 15 players — 2 GK, 5 DEF, 5 MID, 3 FWD. Each gameweek (GW) the manager picks a **starting XI** (pick positions 1–11) and a **bench** (12–15, in substitution order; 12 is always the backup GK).
- **Captain** scores double (multiplier 2); **vice-captain** inherits the armband if the captain plays 0 minutes. The **Triple Captain** chip makes it ×3.
- **Automatic substitutions**: a starter with 0 minutes is replaced by the first eligible bench player (formation rules permitting). The API reports these in `automatic_subs`.
- **Bench Boost** chip: bench players score too (multiplier 1).
- **Form**: FPL's average points per match over the last 30 days.
- **FDR** (Fixture Difficulty Rating): 1 (easiest) – 5 (hardest), per team per fixture.
- **Prices** are stored as tenths of £m.

## The FPL API (unofficial, public, no auth needed for these)

Base URL: `https://fantasy.premierleague.com/api`

| Endpoint | Used for |
| --- | --- |
| `/bootstrap-static/` | All players (`elements`), clubs (`teams`), gameweeks (`events`), positions (`element_types`) |
| `/entry/{teamId}/` | Manager info, overall points/rank, `current_event`, `started_event` |
| `/entry/{teamId}/history/` | Points, transfers made and bank per gameweek, plus chips used (free transfers) |
| `/entry/{teamId}/transfers/` | Every transfer with prices (selling prices); only shows transfers after each deadline |
| `/entry/{teamId}/event/{gw}/picks/` | The 15 picks for a GW, multipliers, captaincy, chip, autosubs, bank/value |
| `/event/{gw}/live/` | Points each player scored in a GW |
| `/fixtures/?future=1` | Upcoming fixtures with FDR |
| `/fixtures/` | Every fixture of the season; finished ones give each club's matches played (predictions) |
| `/element-summary/{id}/` | One player's matches this season (head-to-head) |

The team ID is visible in the URL of the "Points" page on the FPL site: `fantasy.premierleague.com/entry/<TEAM_ID>/event/<GW>`.

## How "points for me" is computed

For every GW since the manager joined, take that GW's picks, apply autosubs and vice-captain promotion, then multiply each player's live GW points by their effective multiplier. Summing this per player gives the points that player has contributed to the manager's total while in the squad. Only players currently in the squad are shown. Transfer hit costs are not attributed to players.

## Head-to-head

For each squad player: the opponent in their club's next fixture, and the player's last 4 appearances (minutes > 0) against that club, newest first.

- **This season** comes from FPL `/element-summary/{id}/` → `history`.
- **Earlier seasons** come from the vaastav dataset (`data/<season>/gws/merged_gw.csv`, `players_raw.csv`, `teams.csv`). It is imported into the `player_fixture_history` table once per season.
- **Matching across seasons:** player and team `id`s change every season, but `code`s are stable. Players are matched by `players_raw.code` = FPL `elements[].code`, and clubs by `teams.code` = FPL `teams[].code`. A player's club at the time is stored as a short name, so moves between clubs show correctly (e.g. Raya at BRE).
- **Insights** use FPL scoring rules for the player's *current* position:
  - Positive: goals, assists, clean sheets (not forwards), bonus, 3+ saves (goalkeepers), penalties saved, and defensive contribution (10 actions for DEF, 12 for MID/FWD).
  - Negative: under 60 minutes, 2+ goals conceded (GK/DEF), cards, own goals, missed penalties, and "Blank" when nothing positive happened and the player scored ≤ 2 points.
- **Scout any player:** the same analysis is available for any Premier League player (`/api/head-to-head/players/:id`). Their next fixture comes from the upcoming-fixtures list and doesn't depend on your team. Results are cached per player (key `head-to-head:player:<id>`).
- **Verdict** is based on average points per meeting: ≥ 6 is good, < 3 is poor, anything else is average, and no meetings means none.

## Predicted points

`projectionModel.ts` predicts each player's FPL points per fixture for the next 5 gameweeks (`/api/projections`, the Predictions page). It is pure and shared by the live service and the backtest. Details and measured accuracy are in [spec 003](docs/specs/003-predicted-points.md).

- **Inputs:**
  - The player's season totals from `bootstrap-static` (minutes, starts, xG, xA, bonus, saves, cards, defensive contributions).
  - Last season's totals from SQLite, matched by `code`, to steady small samples.
  - FPL's availability flags.
  - Club strength.
- **Club strength:** attack = club xG per match (sum of its players' `expected_goals`), defence = xG conceded per match (its goalkeepers' `expected_goals_conceded`). Both are relative to the league average. FPL's own `strength_attack/defence_*` fields are 0 in 2026-27.
- **Per fixture:**
  - Start chance and expected minutes.
  - Goals and assists scaled by the opponent's defence and home advantage.
  - Clean-sheet chance `e^(−opponent's expected goals)`.
  - Expected "−1 per 2 conceded" and "+1 per 3 saves".
  - The chance of reaching the defensive-contribution threshold.
  - Bonus and cards.
  - All scored with the 2025-26 points for the player's position.
- **Gameweeks:** a double gameweek sums its fixtures; a blank gameweek is 0.
- **Head-to-head factor:** at most ±15 % on goals, assists and bonus. The backtest shows it barely matters.
- **FPL's `ep_next`** is shown alongside, but is just the player's form for most players.
- **Explained:** every fixture also returns the model's `inputs` (availability, start share, minutes per start, rates per 90, opponent defence/attack, own defence, home factor, expected goals against, saves and defensive actions per match, points per goal). Each breakdown line is a formula over them, e.g. goals = xG/90 × minutes/90 × opponent defence × home factor × head-to-head × points per goal. The Predictions page shows those formulas; the test suite recomputes them.
- **Backtest:** `npm run backtest [-- <season>]` replays a past season from `player_fixture_history`. That table also stores each match's position, starts and FPL's `xP` (from vaastav `merged_gw.csv`; its xP has gaps, e.g. 0 from GW7 of 2025-26).

## Next gameweek: best XI and captain

`nextGameweek/lineupOptimizer.ts` picks the lineup from the next gameweek's predicted points and play chances (`/api/next-gameweek`, the Next GW page). Details in [spec 004](docs/specs/004-next-gameweek.md).

- **Search:** every legal XI from the 15 (1 GK; 3–5 DEF, 2–5 MID, 1–3 FWD; ~530 XIs) × every order of the 3 outfield bench players.
- **Score of a lineup** = starters' predicted points + armband + expected automatic substitutions.
  - **Armband:** the captain's points again, plus (chance the captain doesn't play) × the vice-captain's points. With a captain who is certain to play, the vice is the best other starter.
  - **Autosubs:** the backup GK covers the starting GK; outfield bench players fill outfield no-shows in bench order (Poisson binomial over the starters' play chances; formation limits on subs are ignored).
- **Comparison:** against the *current* gameweek's picks, because FPL only shows next gameweek's picks after the deadline. Swaps are paired like for like first, then the formation change.
- **Price watch:** FPL's own (undocumented) `price_change_projections` on `bootstrap-static`: a likelihood from −5 to 5 for each of the next price updates (offset 0 = tonight), plus `price_change_percent` (progress to the change) and `price_change_locked_until`. |likelihood| ≥ 3 is "likely", 2 "possible"; locked prices are skipped.
- **Differentials:** players outside the squad owned by under 10% (`selected_by_percent`), top 5 per position by predicted points over the next 5 gameweeks (computed in `projections/`).

## Transfers

`transfers/` suggests the best 0, 1 or 2 transfers for the next gameweek (`/api/transfers`, the Transfers page). Details in [spec 005](docs/specs/005-transfer-suggestions.md).

- **Free transfers** are replayed from `/entry/{id}/history/`: the first squad is free, then +1 each gameweek after subtracting the transfers made (never below 0 before the +1), banked up to 5. A Wildcard or Free Hit keeps the count as it was, with no +1 that week.
- **Selling prices:** purchase price from the latest `/entry/{id}/transfers/` row bringing the player in (Free Hit weeks ignored); first-squad players use the season's starting price (`now_cost − cost_change_start`). Selling price = purchase + half of any rise, rounded down to £0.1m; falls are passed on in full. `/my-team` (exact values) needs the FPL login, so it isn't used.
- **Candidates:** per position, players outside the squad that the most money a sale could free can afford, skipping anyone beaten on both price and points by 3 others, then the top 30 by predicted points over the horizon.
- **Search:** every 1-transfer and 2-transfer combination (like for like, budget = bank + selling prices, max 3 per club for the incoming clubs).
- **Squad score:** the predicted points over the horizon (5 GWs). Each GW counts the greedy best XI (best keeper, 3 DEF / 2 MID / 1 FWD, then the 4 best outfielders), the armband and the expected automatic substitutions, using the Next GW functions.
- **Choice:** `score = gain − 4 × transfers beyond the free ones − 1.5 × (free transfers given up next week)`. Saving scores 0. With 5 banked, one transfer gives nothing up.
- **Pairs** are only listed when they gain more than either move alone.

## Planner

`planner/` (`/api/planner`, `/api/planner/draft`, the Planner page) looks further ahead than one gameweek. Details in [spec 006](docs/specs/006-planner.md).

- **Draft plan:** one saved list of planned transfers (`{ gameweek, outId, inId }`) in the `draft_plan` table. It's replayed every time on the latest predictions with the Transfers rules. Each week shows the best XI, armband and autosubs for the planned squad, free transfers (banked to 5), −4 hits, bank and a suggested next transfer. Saving a plan that breaks a rule is a 400 naming the move; on load, moves for past gameweeks or that no longer work are dropped with a warning. Players bought in the plan are assumed to keep today's price.
- **Chips:** availability comes from `bootstrap-static` `chips` (each chip has a `start_event`–`stop_event` window; two windows per season since 2025-26) and the chips in `/entry/{id}/history/`. Values per gameweek in the horizon:
  - **Bench Boost:** the best lineup's bench points minus the autosub points already expected.
  - **Triple Captain:** the armband's value once more.
  - **Free Hit:** the best squad for that week alone (same budget) minus yours.
  - **Wildcard:** the best squad for the whole horizon minus yours. It's suggested when it beats the Transfers page's recommendation by `wildcardMinGain` (10) points.
  - **Squad search:** the best squads come from repeated best free transfers (singles, then pairs) from 15 candidates per position until nothing improves, not from a solver.
- **Rotation:** every pair of clubs, worth the sum of the better club each week. Goalkeepers use each club's first-choice keeper's predicted points, and only pairs costing ≤ £10m count. Defences use expected clean sheets. A pair only counts if each club starts at least 2 weeks.

## Caching

Three layers on the server:

1. **Past-season history** (`player_fixture_history`): permanent; seasons never change.
2. **SQLite response cache** (`response_cache` table, `app/server/data/fpl.sqlite`): each page's assembled response is stored with its fetch time (keys `team:<teamId>`, `head-to-head:<teamId>`, `head-to-head:player:<id>`, `projections:<teamId>`, `next-gameweek:<teamId>`, `transfers:<teamId>`, `planner:<teamId>`; the draft plan isn't cached). Requests within 30 minutes are answered from the DB without contacting FPL. `?refresh=true` (each page's Refresh button) bypasses it. Failed fetches are never cached.
3. **In-memory FPL response cache** (`fplClient`): finished-gameweek picks/live data for 24 h, everything else for 2 minutes. Speeds up a refetch (only the current gameweek is re-downloaded in practice) and is lost on restart.

## Testing approach

End-to-end Mocha specs under `app/server/test/`, calling the HTTP API through `api` from `test/setup.ts`. The FPL API is never called: MSW answers every request from `app/server/test/mockServer.ts`. The mock season (team `123456`) has two gameweeks designed to exercise captaincy, an automatic substitution, a transfer, an injured player and an unscheduled fixture; expected "points for me" values are hand-calculated in `team.test.ts`. SQLite runs in-memory (see `app/server/src/config/testing.ts`).

## Security posture

Deliberately minimal (personal tool): one admin account whose username and password come from the `ADMIN_USERNAME` / `ADMIN_PASSWORD` environment variables, random bearer tokens held in server memory with an 8-hour TTL, stored in the browser's `sessionStorage`. Not suitable for multi-user or public deployment without replacing this.
