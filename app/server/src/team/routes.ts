// /api/team
import { Router } from 'express';
import { requireAuth, teamOptions } from '../auth/requireAuth.js';
import { teamService } from './teamService.js';

export const teamRoutes = Router();

teamRoutes.use(requireAuth);

// The manager's squad and summary, cached for 30 minutes.
teamRoutes.get('/', async (req, res) => {
  res.json(await teamService.getMyTeam(teamOptions(req, res)));
});
