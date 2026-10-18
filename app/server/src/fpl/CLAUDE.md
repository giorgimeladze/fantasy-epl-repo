# fpl/

The only place that calls the unofficial FPL API (never call it from the browser).

- `fplClient.ts` — one method per endpoint, with an in-memory cache of the in-flight promise: 2 minutes for live data, 24 hours for finished gameweeks. Maps 404 → 404, 503 → 503 ("FPL is updating"), anything else → 502.
- `fplMappers.ts` — shared helpers: `positionOf`, `upcomingFixturesByTeam`.
- `models.ts` — raw FPL payload shapes, only the fields we use. Add fields here rather than using `any`.

FPL re-numbers player and club ids every season; use `code` to match across seasons.
