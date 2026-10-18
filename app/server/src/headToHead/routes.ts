// /api/head-to-head
import { Router } from 'express';
import { requireAuth } from '../auth/requireAuth.js';
import { forceRefresh } from '../utils/http.js';
import { headToHeadService } from './headToHeadService.js';

export const headToHeadRoutes = Router();

headToHeadRoutes.use(requireAuth);

// Each squad player's last matches against their next opponent, cached for 30 minutes.
headToHeadRoutes.get('/', async (req, res) => {
  res.json(await headToHeadService.getHeadToHead(undefined, forceRefresh(req)));
});

// Clubs and players for the scout picker.
headToHeadRoutes.get('/options', async (_req, res) => {
  res.json(await headToHeadService.getScoutOptions());
});

// The same analysis for any one player.
headToHeadRoutes.get('/players/:id', async (req, res) => {
  const playerId = Number(req.params.id);
  if (!Number.isInteger(playerId) || playerId <= 0) {
    res.status(400).json({ error: 'Player id must be a positive integer' });
    return;
  }
  res.json(await headToHeadService.getPlayerHeadToHead(playerId, forceRefresh(req)));
});
