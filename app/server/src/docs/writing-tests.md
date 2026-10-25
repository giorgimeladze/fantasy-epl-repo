# Writing tests

Run with `npm test` (sets `NODE_ENV=test`). Specs live in `app/server/test/`, one `<feature>.test.ts` per endpoint group.

## Rules

1. **End to end only.** Call the HTTP API; never import a service or a pure function to test it directly. Pure logic is covered through the endpoint that uses it.
2. **A spec contains only tests.** Start with one import from `setup.ts`, then `describe` / `it`:
   ```ts
   import assert from 'node:assert/strict';
   import { api, fplCalls } from './setup.js';

   describe('GET /api/team', () => {
     it('lists all 15 players', async () => {
       const res = await api.team();
       assert.equal(res.status, 200);
     });
   });
   ```
   No `beforeEach` for login, mocks or cleanup — `setup.ts` does all of it.
3. **`api` is already logged in** as the admin. For unauthenticated calls use `apiClient()`; for a bad token `apiClient('nope')`.
4. **Every test starts clean:** empty database (all tables), default mock season, no recorded calls. Tests must not depend on each other's order.
5. **Never hit the network.** MSW answers every FPL and past-season request from `test/mockServer.ts`; an endpoint that isn't mocked there returns 404.
6. **Typed bodies:** response bodies are `any`, so name the type where you read one: `const players: PlayerView[] = (await api.team()).body.players;`.
7. **Exact values over vague ones.** The mock season is small and hand-calculated, so assert real numbers (`pointsForMe: 29`), not just `> 0`.

## Tools (all from `./setup.js`)

| Need | Use |
| --- | --- |
| Call an endpoint | `api.team()`, `api.headToHead({ refresh: true })`, … |
| Change one FPL response for this test | `fplReturns('/path/', body)`, `fplFails('/path/', 503)` |
| Edit bootstrap-static first | `const b = bootstrap(); …edit b…; fplReturns('/bootstrap-static/', b)` |
| Check what was fetched | `fplCalls`, `historyCalls`; `resetCalls()` mid-test |
| Back to defaults mid-test | `resetFplMock()` (also clears fplClient's memory cache) |
| Pretend another team ID | `withTeamId(999, () => api.team())` |
| Expire caches | `withClockAhead(config.db.cacheTtlMs + 1000, () => api.team())` |

## Adding mock data

Everything lives in `test/mockServer.ts`. Add a player to `PLAYERS` (only the fields that differ from `DEFAULT_PLAYER`), a handler to `mockServer` for a new FPL endpoint, or a CSV to `HISTORY_FILES`. Changing the shared season can change other tests' expected values — prefer `fplReturns` in the one test that needs it.

## New endpoint?

Add a method to `apiClient` in `test/helpers/namespace.ts`, add the endpoint to the 401 check in `app.test.ts`, and write `<feature>.test.ts`. See [adding-endpoints.md](adding-endpoints.md).
