# auth/

One or two accounts (`config.auth.accounts`, built in `config/accounts.ts`), each with its own FPL team: account 1 from `ADMIN_USERNAME` / `ADMIN_PASSWORD` / `FPL_TEAM_ID`, optional account 2 from `ACCOUNT2_*`. The session holds the account's `teamId`. Sessions are random tokens held in memory (`authService`), lost on restart, expiring after `config.auth.sessionTtlMs`.

- `routes.ts` — `/api/auth/login`, `/session`, `/logout`.
- `requireAuth.ts` — bearer-token middleware; other features apply it with `router.use(requireAuth)`. Puts `session` and `token` on `res.locals`. Team routes pass `teamOptions(req, res)` (or `sessionTeamId(res)`) to their service: services have no default team.
- Credentials are compared through SHA-256 + `timingSafeEqual`; keep it that way. Empty credentials must never log in. Login compares against every account without stopping at a match.
