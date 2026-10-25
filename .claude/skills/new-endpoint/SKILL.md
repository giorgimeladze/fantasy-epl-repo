---
name: new-endpoint
description: Add a new /api/* endpoint (feature folder, service, routes, client API method, E2E test). Use when adding or extending an API route in app/server.
---

# Adding an endpoint

Every `/api/*` route group is a feature folder in `app/server/src/`. Example: `/api/fixtures`.

## Fast path: scaffold it

```bash
node .claude/skills/new-endpoint/scaffold.mjs fixtures            # feature folder fixtures/, GET /api/fixtures
node .claude/skills/new-endpoint/scaffold.mjs priceHistory price-history   # folder priceHistory/, GET /api/price-history
```

It creates `models.ts`, `<feature>Service.ts`, `routes.ts`, `CLAUDE.md` and `test/<feature>.test.ts`, mounts the
router in `src/routes.ts`, and adds the client type re-export, the `api` method, the `apiClient` test method and the
401 check in `app.test.ts`. The stub returns the current gameweek; `npm run check` passes right after. Then fill in
the real response (below) and replace the stub test.

## What goes where (server)

1. **`models.ts`**: the response types. **Types only** (no runtime imports, no Node types): the client imports it.
   `XResponse = XSnapshot & { cache: CacheInfo }`.
2. **`<feature>Service.ts`**: builds the snapshot and exports one object:
   ```ts
   export const fixturesService = {
     getFixtures: cachedEndpoint<FixturesSnapshot>('fixtures', buildSnapshot), // cache key fixtures:<teamId>
   };
   ```
   `buildSnapshot(teamId, forceRefresh)` fetches FPL data only through `fplClient`, and other features only through
   their public service (`teamService.getMyTeam({ teamId, forceRefresh })`, `projectionService.getProjections(...)`).
   Not keyed by team? Use `cachedResponse(key, ttl, forceRefresh, build)` directly (see `head-to-head:player:<id>`).
3. **Pure logic** (more than a few lines): its own file in the feature, no I/O, inputs as parameters (config values
   too). Used by two features? It goes in `shared/` instead; see the `writing-server-code` skill.
4. **`routes.ts`**: thin. Validate params, then call the service:
   ```ts
   export const fixturesRoutes = Router();
   fixturesRoutes.use(requireAuth);
   fixturesRoutes.get('/', async (req, res) => {
     res.json(await fixturesService.getFixtures(forceRefresh(req)));
   });
   fixturesRoutes.get('/:id', async (req, res) => {
     res.json(await fixturesService.getFixture(positiveInt(req.params.id, 'Fixture id must be a positive integer')));
   });
   ```
5. **Errors:** throw `HttpError(status, message)` (`utils/http.ts`); never `res.status(...).json` by hand.
6. **`CLAUDE.md`**: 3–6 lines: what the endpoint returns and each file's job.
7. **Raw FPL fields** go in `fpl/models.ts` (only the fields you read). Prices are tenths of £m: convert with
   `tenths()` on the server.
8. **Settings:** `config/index.ts` (see the `config-variables` skill). **Tables:** see the `db-migration` skill.

## Client

9. `app/client/src/types.ts`: `export type * from '../../server/src/fixtures/models.ts';`
10. `app/client/src/api.ts`: `getFixtures: (forceRefresh = false) => get<FixturesResponse>('/fixtures', forceRefresh),`
11. A page for it: see the `new-page` skill.

## Tests and docs

12. Follow the `writing-tests` skill: `apiClient` method, 401 check in `app.test.ts`, `<feature>.test.ts`.
13. Update the active spec (`new-spec` skill), the README API and test tables, then run `npm run check`.
