// /api/planner
import { Router } from 'express';
import { requireAuth, sessionTeamId, teamOptions } from '../auth/requireAuth.js';
import { draftService } from './draftService.js';
import { plannerService } from './plannerService.js';

export const plannerRoutes = Router();

plannerRoutes.use(requireAuth);

// Chip timing and rotation pairs over the next gameweeks. Cached for 30 minutes.
plannerRoutes.get('/', async (req, res) => {
  res.json(await plannerService.getPlanner(teamOptions(req, res)));
});

// The account's draft plan: queued transfers per gameweek, replayed on today's predictions.
plannerRoutes.get('/draft', async (_req, res) => {
  res.json(await draftService.getDraft(sessionTeamId(res)));
});

plannerRoutes.put('/draft', async (req, res) => {
  res.json(await draftService.saveDraft(req.body, sessionTeamId(res)));
});

plannerRoutes.delete('/draft', async (_req, res) => {
  res.json(await draftService.clearDraft(sessionTeamId(res)));
});
