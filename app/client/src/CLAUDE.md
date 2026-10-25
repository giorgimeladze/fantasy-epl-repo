# app/client/src

React 19 + Vite SPA. No business logic: the server sends values ready to show.

- `api.ts` — the only place that calls `fetch` (lint-enforced); bearer token, `get(path, forceRefresh)` → `?refresh=true`, `UnauthorizedError` on 401.
- `types.ts` — re-exports the server's `<feature>/models.ts` (type-only): the API contract is defined once.
- `routes.ts` — every page (`hash`, nav `label`, `Page`) in nav order; `App` and `NavBar` read it. `PageProps` = `{ onUnauthorized }`.
- `hooks/` — `useApiResource(fetcher, onUnauthorized)` (load on mount, `reload(force)`, `mutate(call)`, 401 → sign out), `useHashRoute`.
- `lib/format.ts` — every display formatter (`pts`, `fixed`, `signed`, `money`, `pct`, `time`, `deadline`, `gameweekRange`, `fetchedAt`) and `POSITIONS`, `CHIP_NAMES`.
- `components/` — shared UI only: `NavBar`, `PageToolbar`, `ErrorMessage`, `StatTiles`, `Segmented`, `FixtureChip`, `ProjectionTable` (+ `FixtureExplanation`: each line as the model's formula).
- `features/<feature>/` — a page and the components only it uses:
  - `auth/` LoginPage · `dashboard/` (`#/`: ManagerHeader, Pitch, PlayerTable)
  - `nextGameweek/` (`#/next-gw`: summary, changes, LineupPitch, captain, reasons, formations, price watch, differentials)
  - `transfers/` (`#/transfers`: recommendation, OptionCard/OptionList, selling prices, free-transfer history)
  - `planner/` (`#/planner`: DraftPlan + PlanWeek + AddTransfer, ChipCard, RotationTable)
  - `predictions/` (`#/predictions`) · `headToHead/` (`#/head-to-head`: HeadToHeadCard, PlayerScout)
- `styles.css` — plain CSS, one `/* Page */` block per page.

Features never import each other; shared pieces go in `components/` (lint-enforced). Skills: `writing-components`, `new-page`.
