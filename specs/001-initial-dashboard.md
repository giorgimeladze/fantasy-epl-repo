# 001 — Initial dashboard

- **Status:** Done
- **Started:** 2026-10-01
- **Scope:** Project setup, authentication, team dashboard, tests, SQLite cache

What this update had to deliver, what was delivered, and what is still open. Implementation details live in the code and in [AGENTS.md](../AGENTS.md).

## Goal

A private web app where the owner logs in and gets a single view of their Fantasy Premier League team, with the information needed to judge each player: form, upcoming fixtures and the points each player has earned for the team.

## Requirements

### R1. Tech stack
- Backend: Node.js (latest installed: 22) with TypeScript.
- Frontend: React (latest: 19) with TypeScript.
- Use the latest TypeScript (7).

### R2. Authentication
- The first screen is a sign-in page. Nothing else is reachable without signing in.
- One admin account with credentials written directly in config: `admin` / `Qwerty12!`.
- Wrong credentials show an error message.
- The user can sign out. An expired session sends the user back to the sign-in page.

### R3. Team landing page (after sign-in)
- Show the manager's team for the current gameweek: all 15 players.
- Separate the **starting XI** (laid out by position) from the **bench**.
- Mark the captain and vice-captain.
- For every player show:
  - form
  - next fixtures (opponent, home/away, difficulty)
  - points this gameweek
  - points this player has earned for the manager this season
  - season stats: price, total points, points per game, minutes, goals, assists, clean sheets, bonus, xG, xA, ICT, ownership %
  - injury/availability news
- Show a team summary: team and manager name, gameweek points, total points, overall rank, team value, bank, active chip, transfer hits and points left on the bench.

### R4. Project documentation
- `CLAUDE.md` that points to `AGENTS.md` (agent instructions).
- `CONTEXT.md` (domain background).
- `README.md` (setup and usage).
- A spec file (this file).

### R5. Tests
- Automated tests using **Mocha**.
- Third-party (FPL API) calls are **mocked** with representative data; tests never use the network.
- Cover scoring rules, team assembly, caching, authentication and the HTTP endpoints.

### R6. Local persistence and caching
- Set up a **SQLite** database.
- After the team is fetched from FPL, store it and serve it from the database for **30 minutes** instead of calling FPL on every request.
- After 30 minutes the next request fetches fresh data.

### R7. Running locally
- The README explains step by step how to install, configure and run the project on a local machine.

## Done

- [x] **R1**: npm workspaces monorepo. `server/` runs Express 5 on Node 22 with TS 7. `client/` runs React 19 on Vite 8 with TS 7. Strict TypeScript in both.
- [x] **R2**:
  - Sign-in page and server-side credential check against `server/src/config.ts`.
  - Random session tokens that expire after 8 hours. All data routes require a token.
  - Sign out works. A 401 sends the user back to sign-in.
- [x] **R3**:
  - The dashboard loads data from the server, which calls the public FPL API and caches the results.
  - Pitch view of the starting XI by position, with captain and vice-captain armbands. Each player card shows gameweek points, form and next fixture. Players with availability flags are highlighted.
  - Bench row.
  - Sortable statistics table for all 15 players, including the next 5 fixtures colour-coded by difficulty and the "points for me" column.
  - Manager summary tiles.
  - Refresh button.
- [x] **"Points for me" calculation**: added up over every gameweek since the team joined. It accounts for captain and triple-captain multipliers, bench boost, automatic substitutions and the vice-captain taking the armband. Covered by unit tests.
- [x] **R4**: `CLAUDE.md` (imports `AGENTS.md`), `AGENTS.md`, `CONTEXT.md`, `README.md` and this spec are written.
- [x] **R5**:
  - 42 Mocha specs under `server/test/`: points calculator, team service, SQLite cache repository, auth service, and HTTP routes via supertest.
  - The FPL API is mocked with JSON fixtures in `server/test/mocks/fpl/`. They model a 2-gameweek season with a captain, an auto-sub, a transfer, an injury and an unscheduled fixture.
  - Tests use an in-memory SQLite database.
- [x] **R6**:
  - SQLite through Node's built-in `node:sqlite`, so no native dependency. A versioned migration creates the `team_cache` table.
  - Team data is cached for 30 minutes. The response reports the fetch time and whether it came from the cache. The Refresh button skips the cache.
  - Failed fetches are not cached.
  - Verified against the live API: the first request took about 0.7 s and the next one about 1 ms from the cache.
- [x] **R7**: the README covers prerequisites, install, `.env` configuration, dev and production runs, caching, tests and troubleshooting.
- [x] Production mode: `npm run build && npm start` serves the API and the built app from a single Express process.
- [x] Checked against the live FPL API (sample team ID 1): typecheck passes, tests pass, and the build succeeds.

## Known limitations

- The team ID is set by configuration (`FPL_TEAM_ID`). It cannot be chosen in the UI.
- Sessions are held in memory, so restarting the server signs everyone out. Only the team cache is stored in SQLite.
- Data can be up to 30 minutes old unless Refresh is clicked. This includes live scores during a gameweek.
- `node:sqlite` is still marked experimental in Node 22. The warning is silenced in the npm scripts.
- "Points for me" only covers players currently in the squad. Players already sold are not listed.
- Transfer hit costs are not charged to any player.
- The vice-captain only takes the armband once the gameweek is finished. While a gameweek is live, a captain with 0 minutes still counts as captain.
- The FPL API is unofficial. Its fields can change between seasons, and it returns 503 while gameweeks are being updated.

## Possible next steps

- [ ] Choose the team ID in the UI, or link it to the signed-in user.
- [ ] Player detail view: gameweek-by-gameweek points history and the full fixture list.
- [ ] Show players sold this season and the points they earned while in the squad.
- [ ] Transfer suggestions based on form and fixture difficulty.
- [ ] Move credentials to environment variables with a hashed password, and keep sessions in a persistent store.
- [ ] Client tests (React Testing Library). Server tests are done, see R5.
- [ ] Store sessions in SQLite so a server restart does not sign the user out.
- [ ] Keep gameweek history in SQLite so earlier gameweeks are never fetched again.
- [ ] Dark mode.
