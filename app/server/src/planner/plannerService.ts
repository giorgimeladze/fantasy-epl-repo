import { cachedEndpoint } from '../db/responseCache.js';
import { loadDecisionContext } from '../shared/decision/decisionContext.js';
import { chipAdvice } from './chipAdvice.js';
import type { PlannerResponse } from './models.js';
import { rotationAdvice } from './rotationAdvice.js';

type PlannerSnapshot = Omit<PlannerResponse, 'cache'>;

async function buildPlanner(teamId: number, forceRefresh: boolean): Promise<PlannerSnapshot> {
  const context = await loadDecisionContext(teamId, forceRefresh);
  return {
    gameweek: context.gameweek,
    gameweeks: context.gameweeks,
    chips: chipAdvice(context),
    rotation: rotationAdvice(context),
  };
}

export const plannerService = {
  /** Chip timing and rotation pairs over the horizon. Cached in SQLite for config.db.cacheTtlMs. */
  getPlanner: cachedEndpoint<PlannerSnapshot>('planner', buildPlanner),
};
