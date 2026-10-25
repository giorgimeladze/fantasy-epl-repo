// The /api router: mounts each feature's routes. Handlers live in <feature>/routes.ts.
import { Router } from 'express';
import { authRoutes } from './auth/routes.js';
import { headToHeadRoutes } from './headToHead/routes.js';
import { nextGameweekRoutes } from './nextGameweek/routes.js';
import { plannerRoutes } from './planner/routes.js';
import { projectionRoutes } from './projections/routes.js';
import { teamRoutes } from './team/routes.js';
import { transferRoutes } from './transfers/routes.js';

export const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

router.use('/auth', authRoutes);
router.use('/team', teamRoutes);
router.use('/head-to-head', headToHeadRoutes);
router.use('/projections', projectionRoutes);
router.use('/next-gameweek', nextGameweekRoutes);
router.use('/transfers', transferRoutes);
router.use('/planner', plannerRoutes);

// Unknown /api routes get JSON, not the SPA fallback.
router.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});
