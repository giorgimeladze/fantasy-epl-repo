// /api/planner
import { Router } from 'express';
import { requireAuth } from '../auth/requireAuth.js';
import { forceRefresh } from '../utils/http.js';
import { draftService } from './draftService.js';
import { plannerService } from './plannerService.js';

export const plannerRoutes = Router();

plannerRoutes.use(requireAuth);

// Chip timing and rotation pairs over the next gameweeks. Cached for 30 minutes.
plannerRoutes.get('/', async (req, res) => {
  res.json(await plannerService.getPlanner(forceRefresh(req)));
});

// The one draft plan: queued transfers per gameweek, replayed on today's predictions.
plannerRoutes.get('/draft', async (_req, res) => {
  res.json(await draftService.getDraft());
});

plannerRoutes.put('/draft', async (req, res) => {
  res.json(await draftService.saveDraft(req.body));
});

plannerRoutes.delete('/draft', async (_req, res) => {
  res.json(await draftService.clearDraft());
});
