// /api/projections
import { Router } from 'express';
import { requireAuth, teamOptions } from '../auth/requireAuth.js';
import { projectionService } from './projectionService.js';

export const projectionRoutes = Router();

projectionRoutes.use(requireAuth);

// Predicted points for the next gameweeks (squad + top players per position), cached for 30 minutes.
projectionRoutes.get('/', async (req, res) => {
  res.json(await projectionService.getProjections(teamOptions(req, res)));
});
