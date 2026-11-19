# Second account (a friend's FPL team)

- **Written:** 2026-11-19
- **Goal:** a friend uses the same dashboard for their own FPL team. Each person sees only their own squad, predictions, transfers and draft plan.
- **Status:** implemented 2026-11-19 (steps 1–6). Left: step 7, the production env file. The half-set-account check has no automated test (config is read once at startup; tests are E2E only).
- **Deployment:** [deployment-roadmap.md](deployment-roadmap.md) Phase 6 (GitHub Actions) is paused; until it works, the production env file is edited by hand on the server.

## What the code already supports

Most of the work is done already, because the server was built around a team ID from the start:

| Piece | Keyed by | Reusable for a second team? |
| --- | --- | --- |
| `response_cache` (team, projections, next GW, transfers, planner, head-to-head) | `<endpoint>:<teamId>` (`cachedEndpoint` in [responseCache.ts](../../app/server/src/db/responseCache.ts)) | Yes, as is |
| `draft_plan` | `team_id` primary key | Yes, as is |
| `history_import`, `player_fixture_history` (past seasons) | season / player `code` | Yes, shared (not team-specific) |
| `fplClient` cache (bootstrap, fixtures, live gameweeks) | FPL URL | Yes, shared |
| Services (`teamService`, `projectionService`, `draftService`, …) | take `teamId` in their options | Yes; today they fall back to `config.fpl.teamId` |
| **Routes** | pass no `teamId`, so always the default team | **Change** |
| **Auth** | one account from `ADMIN_USERNAME` / `ADMIN_PASSWORD` | **Change** |

So no table or migration is needed. The change is: know *which team* a request is for, and pass it through.

## Decision: two accounts, each with its own team

Each person has their own username and password. The login decides the team: the session stores the `teamId`, and every route passes it to its service.

- Exactly two accounts: yours (account 1) and your friend's (account 2). No more for now.
- Each account sees only its own team. There is no team switcher, and neither person can open the other's team or draft plan.
- Why: least code (auth plus one line per route), no new UI, private draft plans, and the friend never needs your password.

Rejected: one shared login with a "choose team" pop-up (more UI, shared password, both can edit both draft plans), and a second copy of the app (double memory on the 512 MB server, a second domain and deploy).

## Plan

### 1. Config: two accounts

- `config.auth.accounts: { username, password, teamId }[]` (one or two entries), replacing `config.auth.username/password` and `config.fpl.teamId`.
- Env variables: keep the current three as account 1, add an optional second set (separate variables rather than one combined value, which would need quoting rules for passwords inside systemd's `EnvironmentFile`):
  ```
  ADMIN_USERNAME=…        ADMIN_PASSWORD=…        FPL_TEAM_ID=…          # account 1 (unchanged)
  ACCOUNT2_USERNAME=…     ACCOUNT2_PASSWORD=…     ACCOUNT2_FPL_TEAM_ID=… # account 2 (optional)
  ```
  Account 2 is all-or-nothing: setting only some of its three variables stops the server at startup. No existing `.env` or server env file breaks.
- `production.ts`: account 1 stays required; validation as above.
- `testing.ts`: two fixed accounts with two different team IDs.
- Update `.env.example` and `deploy/production.env.example`. Skill: `config-variables`.

### 2. Auth: the session knows the team

- `Session` gets `teamId`; `LoginResponse` and `GET /api/auth/me` return it too (the client may show it).
- `authService.login` compares the given credentials against **every** account with `safeEqual`, without stopping at the first match, so response time doesn't reveal which usernames exist.
- `isConfigured()`: at least one complete account.

### 3. Routes pass the session's team

- Each team route passes `teamId: res.locals.session.teamId` along with `forceRefresh`: team, projections, next gameweek, transfers, planner, draft (get/save/clear), head-to-head.
- **Remove the `config.fpl.teamId` defaults** in `cachedEndpoint`, `projectionService.getLeagueProjections` and `draftService`, making `teamId` required. Then the compiler finds any route that forgot it, instead of it silently showing account 1's team.
- `server.ts`: the "FPL_TEAM_ID is not set" warning becomes a per-account check.

### 4. Client

- Probably nothing required: pages show the squad from `/api/team`, which is now the logged-in person's team.
- Nice to have: show the manager or team name next to "Log out" so it is obvious whose team is open.
- Tabs: the token is in `sessionStorage`, which is per tab, so two accounts can even be open side by side in two tabs of one browser.

### 5. Tests (E2E, `writing-tests` skill)

- `mockServer.ts`: a second entry with its own picks and history.
- Account 1 and account 2 each log in and get their own team in `/api/team` (and one other endpoint, e.g. `/api/transfers`).
- A draft saved by account 2 is not returned to account 1.
- Wrong password for account 2, and account 1's password with account 2's username, both return 401.
- Config: a half-set account 2 is refused (unit-level through `production()` or a startup test, whichever fits the test style).

### 6. Docs

- `CONTEXT.md` (it says "one admin account" in two places), `app/server/src/auth/CLAUDE.md`.
- Spec 008's environment-variable table, and `deploy.yml`: it writes the `ACCOUNT2_*` lines from optional `production` secrets of the same names, so a deploy never drops account 2.

### 7. Production

- On the server: add the three `ACCOUNT2_*` lines to `/etc/fantasy-epl/env`, then deploy the new release (by hand, as in roadmap Phase 4).
- Memory: a cold cache now builds projections for two teams. Peak RSS was 134 MB for one team on the 512 MB server; check `free -m` and `journalctl -u fantasy-epl` after the friend's first visit.
- The FPL API sees about twice the team-specific calls (entry, picks); league-wide calls are shared. Still low with the 30-minute cache.

## Known limitations

- Sessions are in memory: every deploy or restart logs both people out (existing behaviour).
- Changing a password means editing the env file and restarting.
- Two accounts only. A third person would need another set of env variables (or a list format) and a new decision.
- Each person's league-wide projections are computed and cached separately (they are keyed by team, though mostly the same). Fine for two teams.
