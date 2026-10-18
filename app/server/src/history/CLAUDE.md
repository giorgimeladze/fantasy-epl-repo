# history/

Past-season match data from github.com/vaastav/Fantasy-Premier-League (`config.history.baseUrl`), stored in SQLite.

- `historyImporter.ts` — `ensureSeasons` downloads each season's CSVs once (`merged_gw`, `players_raw`, `teams`), maps season-specific ids to stable `code`s, and records the import in `history_import`. Missing seasons are skipped and retried on a later call.
- `fixtureHistoryRepository.ts` — the `player_fixture_history` table: matches against an opponent, season totals, head-to-head averages.

Columns a season doesn't have (e.g. `starts`, `defensive_contribution`, `expected_points` in older seasons) are stored as `null`. To force a re-import, delete `app/server/data/`.
