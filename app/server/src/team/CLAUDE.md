# team/

`/api/team`: the manager's 15 players, summary and current gameweek.

- `teamService.ts` — builds the `TeamSnapshot` from FPL (bootstrap, entry, picks and live data for every gameweek played) and caches it under `team:<id>`.
- `pointsCalculator.ts` — pure scoring rules: multipliers, automatic subs, captain/vice-captain promotion, bench boost. "Points for me" adds these up across gameweeks.
- `models.ts` — also home to shared types used by other features: `Position`, `Club`, `UpcomingFixture`, `CacheInfo`.

Prices arrive in tenths of £m; convert here, never in the client. Sold players are left out of `players`.
