import { Router } from 'express';
import type { LoginRequest } from './models/auth.js';
import { requireAuth } from './middleware/requireAuth.js';
import { authService } from './services/authService.js';
import { teamService } from './services/teamService.js';

export const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.post('/auth/login', (req, res) => {
  const { username, password } = (req.body ?? {}) as Partial<LoginRequest>;
  if (typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  const result = authService.login(username, password);
  if (!result) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }
  res.json(result);
});

router.get('/auth/session', requireAuth, (_req, res) => {
  res.json({ username: res.locals.session.username });
});

router.post('/auth/logout', requireAuth, (_req, res) => {
  authService.logout(res.locals.token);
  res.status(204).end();
});

// Served from the SQLite cache for 30 minutes; ?refresh=true forces a fresh fetch from FPL.
router.get('/team', requireAuth, async (req, res) => {
  const forceRefresh = req.query.refresh === 'true';
  res.json(await teamService.getMyTeam(undefined, { forceRefresh }));
});

// Unknown /api routes get JSON, not the SPA fallback.
router.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});
