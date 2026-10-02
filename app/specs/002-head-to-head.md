# 002 — Head-to-head page

- **Status:** Done
- **Started:** 2026-10-02
- **Scope:** Each player's record against their next opponent, on a new page reached from a top navigation bar, plus a picker to scout any Premier League player
- **Builds on:** [001 — Initial dashboard](001-initial-dashboard.md)

## Goal

Help decide who to start and who to captain. For every player in the squad, show how they did in their last 4 matches against the club they face next: minutes, goals, assists and everything else that earned or cost them FPL points.

## Requirements

### R1. Head-to-head data
- For each of the 15 players, find the opponent in their next fixture.
- Show the player's last 4 matches against that opponent, newest first. Look back beyond the current season if needed.
- Per match: date, season, scoreline and result, minutes, goals, assists, clean sheet, bonus, xG, xA and FPL points.
- Per match, highlight what earned points (goals, assists, clean sheets, bonus, saves, penalty saves, defensive contributions) and what cost points (cards, goals conceded, own goals, missed penalties, short minutes, blanks).
- Per player, a summary: number of matches, average points, totals, and a verdict (good, average or poor record).

### R2. New page with navigation
- A navigation bar at the top with **My team** and **Head-to-head**.
- The Head-to-head page lists every player's record and can be filtered (all / starting XI / bench) and sorted (squad order / best / worst record).
- It works on a phone-width screen.

### R3. Caching and tests
- Don't call outside sources on every page view. Use the same 30-minute caching as the team page, plus a Refresh button.
- Mocha tests with mocked data for every new outside source.

### R4. Scout any player
- At the end of the Head-to-head page, choose any club, then one of its players.
- Show that player's last 4 matches against their next opponent, presented the same way as the squad cards.

## Done

- [x] **R1**:
  - **This season** comes from FPL's player summary endpoint.
  - **Earlier seasons** come from the community [vaastav/Fantasy-Premier-League](https://github.com/vaastav/Fantasy-Premier-League) dataset, because FPL's API has no match-by-match history for past seasons.
  - **Coverage:** the last 4 seasons are downloaded once and stored permanently in SQLite (about 113k match rows).
  - **Matching across seasons** uses FPL's stable player and club codes, so it still works when a player changed club. That club is shown in the match row.
  - Only matches the player actually played in are counted.
  - Insights follow FPL scoring rules for the player's position. The verdict is based on average points per match: 6 or more is good, under 3 is poor.
- [x] **R2**:
  - Navigation bar with My team and Head-to-head; each page has its own bookmarkable address.
  - One card per player showing the next fixture with its difficulty, a verdict badge and summary, and a match table with green and red highlight chips.
  - Filter and sort controls.
  - The layout adapts to narrow screens.
- [x] **R3**:
  - The whole page is cached in SQLite for 30 minutes, and Refresh skips the cache.
  - Past seasons are never downloaded again. A season the source doesn't have yet is skipped and retried later.
  - 39 new Mocha tests (81 in total). They cover the history import, match lookup, insights and verdicts, assembling the page, caching, the CSV parser and the new endpoint.
  - Tests use mocked FPL responses and mocked past-season CSVs, so they never touch the network.
- [x] **R4** (added after the first delivery, same day):
  - A "Scout any player" section at the bottom of the page. Pick a club, then a player; players are grouped by position and ★ marks your own squad. The result uses the same card, tagged "In your squad" when relevant.
  - Two new endpoints, `GET /api/head-to-head/options` and `GET /api/head-to-head/players/:id`, which reuse the squad analysis. Each player's result is cached for 30 minutes.
  - 10 more tests, 91 in total. They check that a single player's result matches the squad view, cover a player outside the squad, the 404 for an unknown player, separate caching per player, the order of the picker options, and the new routes, including input validation.
  - Checked live: 20 clubs and 667 players in the picker. G. Jesus has 3 matches against next opponent Leeds, because Leeds weren't in the Premier League for two of the seasons covered.
- [x] **Checked against live data** (sample team 1): the first load took about 5 s including the history import, a cached load about 2 ms, and a refresh about 0.5 s.

## Known limitations

- Only the **next** fixture's opponent is analysed. In a double gameweek, the second opponent is ignored.
- Clubs promoted this season have no Premier League history to compare against. Those players show "No history".
- Insights use the player's **current** position, even for older seasons where it may have differed.
- Past seasons depend on a third-party GitHub dataset. If GitHub is unreachable on the very first load, the page shows an error until it is reachable again. After the first import, past data is served from SQLite.
- The verdict thresholds (6 / 3 average points) are fixed. They don't adjust for position or price.
- The history table adds about 17 MB to `app/server/data/fpl.sqlite`.

## Possible next steps

- [ ] Let the user pick which upcoming fixture to analyse, or show the next 2–3.
- [ ] Compare each player's record to their season average, not just to fixed thresholds.
- [ ] Add head-to-head context (verdict badge) to the player cards on My team.
- [ ] Download past seasons on startup in the background, so the first visit is instant.
