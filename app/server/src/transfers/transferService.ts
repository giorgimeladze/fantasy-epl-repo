import { config } from '../config/index.js';
import { cachedEndpoint } from '../db/responseCache.js';
import { loadDecisionContext } from '../shared/decision/decisionContext.js';
import { searchFromContext, transferOption } from '../shared/decision/transferOption.js';
import type { TransferPlan } from '../shared/decision/transferSearch.js';
import { round2, sum, tenths } from '../shared/numbers.js';
import type { TransfersResponse } from './models.js';

type TransfersSnapshot = Omit<TransfersResponse, 'cache'>;

async function buildSnapshot(teamId: number, forceRefresh: boolean): Promise<TransfersSnapshot> {
  const context = await loadDecisionContext(teamId, forceRefresh);
  const { bank, freeTransfers } = context;
  const { maxFreeTransfers, hitCost, maxPerClub, savedTransferValue, candidatesPerPosition } = config.transfers;
  const result = searchFromContext(context);
  const option = (plan: TransferPlan) => transferOption(plan, result.baseline, context);

  return {
    gameweek: context.gameweek,
    gameweeks: context.gameweeks,
    freeTransfers: freeTransfers.available,
    maxFreeTransfers,
    freeTransferHistory: freeTransfers.weeks,
    bank: tenths(bank),
    squad: context.squadSales,
    squadPoints: round2(sum(result.baseline)),
    squadPerGameweek: result.baseline.map(round2),
    recommended: option(result.recommended),
    save: option(result.save),
    single: result.single.map(option),
    double: result.double.map(option),
    rules: { hitCost, maxPerClub, savedTransferValue, candidatesPerPosition },
  };
}

export const transferService = {
  /**
   * Transfer suggestions for the next gameweek (0, 1 or 2 moves) with free transfers, selling prices
   * and the budget worked out from the public FPL data. Cached in SQLite for config.db.cacheTtlMs.
   */
  getTransfers: cachedEndpoint<TransfersSnapshot>('transfers', buildSnapshot),
};
