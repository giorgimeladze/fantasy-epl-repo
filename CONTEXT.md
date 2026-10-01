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
| `/entry/{teamId}/event/{gw}/picks/` | The 15 picks for a GW, multipliers, captaincy, chip, autosubs, bank/value |
| `/event/{gw}/live/` | Points each player scored in a GW |
| `/fixtures/?future=1` | Upcoming fixtures with FDR |

The team ID is visible in the URL of the "Points" page on the FPL site: `fantasy.premierleague.com/entry/<TEAM_ID>/event/<GW>`.

## How "points for me" is computed

For every GW since the manager joined, take that GW's picks, apply autosubs and vice-captain promotion, then multiply each player's live GW points by their effective multiplier. Summing this per player gives the points that player has contributed to the manager's total while in the squad. Only players currently in the squad are shown. Transfer hit costs are not attributed to players.

## Caching

Two layers on the server:

1. **SQLite team cache** (`team_cache` table, `server/data/fpl.sqlite`): the fully assembled team for a team ID is stored with its fetch time. Requests within 30 minutes are answered from the DB without contacting FPL. `?refresh=true` (the dashboard's Refresh button) bypasses it. Failed fetches are never cached.
2. **In-memory FPL response cache** (`fplClient`): finished-gameweek picks/live data for 24 h, everything else for 2 minutes. Speeds up a refetch (only the current gameweek is re-downloaded in practice) and is lost on restart.

## Testing approach

Mocha specs under `server/test/`. The FPL API is never called: `mockFplApi()` swaps global `fetch` for a router that serves JSON from `server/test/mocks/fpl/`. The mock season (team `123456`) has two gameweeks designed to exercise captaincy, an automatic substitution, a transfer, an injured player and an unscheduled fixture; expected "points for me" values are hand-calculated in `teamService.test.ts`. SQLite runs in-memory (`DATABASE_PATH=:memory:`).

## Security posture

Deliberately minimal (personal tool): one admin account whose username and password come from the `ADMIN_USERNAME` / `ADMIN_PASSWORD` environment variables, random bearer tokens held in server memory with an 8-hour TTL, stored in the browser's `sessionStorage`. Not suitable for multi-user or public deployment without replacing this.
