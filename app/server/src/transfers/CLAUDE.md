# transfers/

`/api/transfers`: who to sell and buy before the next gameweek (0, 1 or 2 transfers), over the next `config.projections.gameweeks` gameweeks, cached under `transfers:<id>`.

- `transferService.ts` — assembles the response from `shared/decision/` (`loadDecisionContext`, `searchFromContext`, `transferOption`). The search, free transfers, selling prices and reasons live there because planner/ uses them too.
- `models.ts` — the response types (also used by `shared/decision/`).
