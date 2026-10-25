// /api/auth
import { Router } from 'express';
import { authService } from './authService.js';
import type { LoginRequest } from './models.js';
import { HttpError } from '../utils/http.js';
import { requireAuth } from './requireAuth.js';

export const authRoutes = Router();

authRoutes.post('/login', (req, res) => {
  const { username, password } = (req.body ?? {}) as Partial<LoginRequest>;
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new HttpError(400, 'username and password are required');
  }

  const result = authService.login(username, password);
  if (!result) throw new HttpError(401, 'Invalid username or password');
  res.json(result);
});

authRoutes.get('/session', requireAuth, (_req, res) => {
  res.json({ username: res.locals.session.username });
});

authRoutes.post('/logout', requireAuth, (_req, res) => {
  authService.logout(res.locals.token);
  res.status(204).end();
});
