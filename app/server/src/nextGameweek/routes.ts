// /api/next-gameweek
import { Router } from 'express';
import { requireAuth } from '../auth/requireAuth.js';
import { forceRefresh } from '../utils/http.js';
import { nextGameweekService } from './nextGameweekService.js';

export const nextGameweekRoutes = Router();

nextGameweekRoutes.use(requireAuth);

// Best XI, bench order and captain for the next gameweek, plus price watch and differentials. Cached for 30 minutes.
nextGameweekRoutes.get('/', async (req, res) => {
  res.json(await nextGameweekService.getNextGameweek(forceRefresh(req)));
});
