# Adding an endpoint

Every `/api/*` route group is a feature folder in `app/server/src/`. Example: `/api/fixtures`.

## Server

1. **Folder** `src/fixtures/` with:
   - `models.ts` — the response types. **Types only** (no runtime imports, no Node types): the client imports this file.
   - `fixturesService.ts` — builds the response. Fetch FPL data only through `fplClient`; wrap the result in `cachedResponse('fixtures:<id>', config.db.cacheTtlMs, forceRefresh, build)` from `db/responseCache.ts`.
   - pure logic in its own file(s) if it's more than a few lines (no I/O, easy to reason about).
   - `routes.ts` — thin handlers:
     ```ts
     export const fixturesRoutes = Router();
     fixturesRoutes.use(requireAuth);
     fixturesRoutes.get('/', async (req, res) => {
       res.json(await fixturesService.getFixtures(undefined, forceRefresh(req)));
     });
     ```
   - `CLAUDE.md` — 3–6 lines: what the endpoint returns and the files' jobs.
2. **Mount** it in `src/routes.ts`: `router.use('/fixtures', fixturesRoutes);`
3. **Errors:** throw `HttpError(status, message)` from `utils/http.ts` for expected failures; validate params in the route (400) before calling the service.
4. **Raw FPL fields** you need go in `fpl/models.ts` (only the fields you read). Prices are tenths of £m — convert on the server.
5. **Settings** (counts, limits): add to `config/index.ts`, see [config-variables.md](config-variables.md).
6. **Database tables:** append a migration to `MIGRATIONS` in `db/database.ts`; never edit an old one.

## Client

7. Re-export the models in `app/client/src/types.ts`: `export type * from '../../server/src/fixtures/models.ts';`
8. Add a method to `api` in `app/client/src/api.ts` (with `forceRefresh` → `?refresh=true`).
9. New page: `src/pages/<Name>Page.tsx` using `useApiResource`, then add it to `ROUTES` (`hooks/useHashRoute.ts`) and `LINKS` (`components/NavBar.tsx`).

## Tests and docs

10. Follow [writing-tests.md](writing-tests.md): `apiClient` method, 401 check in `app.test.ts`, `fixtures.test.ts`, mock data in `test/mockServer.ts`.
11. Update the active spec in `docs/specs/` and the README test table. Run `npm run typecheck` and `npm test`.
