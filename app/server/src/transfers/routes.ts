// /api/transfers
import { Router } from 'express';
import { requireAuth } from '../auth/requireAuth.js';
import { forceRefresh } from '../utils/http.js';
import { transferService } from './transferService.js';

export const transferRoutes = Router();

transferRoutes.use(requireAuth);

// Suggested transfers for the next gameweek, with free transfers, selling prices and budget. Cached for 30 minutes.
transferRoutes.get('/', async (req, res) => {
  res.json(await transferService.getTransfers(undefined, forceRefresh(req)));
});
