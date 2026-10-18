# auth/

Single admin account from `ADMIN_USERNAME` / `ADMIN_PASSWORD` (see `config.auth`). Sessions are random tokens held in memory (`authService`), lost on restart, expiring after `config.auth.sessionTtlMs`.

- `routes.ts` — `/api/auth/login`, `/session`, `/logout`.
- `requireAuth.ts` — bearer-token middleware; other features apply it with `router.use(requireAuth)`. Puts `session` and `token` on `res.locals`.
- Credentials are compared through SHA-256 + `timingSafeEqual`; keep it that way. Empty credentials must never log in.
