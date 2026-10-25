// The Transfers page's search on a decision context, and its response view. Shared by transfers/
// (the suggestions) and planner/ (the Wildcard comparison and the draft plan's next-move hint).
import { config } from '../../config/index.js';
import type { TransferOption } from '../../transfers/models.js';
import { round2, sum, tenths } from '../numbers.js';
import type { DecisionContext } from './decisionContext.js';
import { candidatePool, searchTransfers, type TransferPlan, type TransferSearchResult } from './transferSearch.js';

/** The best 0, 1 or 2 transfers for the context's squad. */
export function searchFromContext(context: DecisionContext): TransferSearchResult {
  const { squad, bank, freeTransfers } = context;
  const { maxFreeTransfers, ...transferConfig } = config.transfers;

  const topSales = squad
    .map((p) => p.price)
    .sort((a, b) => b - a)
    .slice(0, transferConfig.maxTransfers);
  const pool = candidatePool(context.league, squad, bank + sum(topSales), transferConfig.candidatesPerPosition);
  return searchTransfers(squad, pool, {
    ...transferConfig,
    bank,
    freeTransfers: freeTransfers.available,
    maxFreeTransfers,
  });
}

/** The response view of a plan; `baseline` is the squad's points per gameweek without it. */
export function transferOption(
  plan: TransferPlan,
  baseline: readonly number[],
  context: DecisionContext,
): TransferOption {
  const sales = new Map(context.squadSales.map((s) => [s.id, s.sellingPrice]));
  return {
    moves: plan.moves.map((m) => {
      const [out, incoming] = [context.view(m.outId), context.view(m.inId)];
      return {
        out,
        in: incoming,
        sellingPrice: sales.get(m.outId) ?? out.price,
        gain: round2(incoming.horizonPoints - out.horizonPoints),
      };
    }),
    gain: round2(plan.gain),
    gainPerGameweek: plan.perGameweek.map((points, i) => round2(points - baseline[i]!)),
    hitCost: plan.hitCost,
    netGain: round2(plan.netGain),
    freeTransfersNext: plan.freeTransfersNext,
    bankAfter: tenths(plan.bankAfter),
    score: round2(plan.score),
  };
}
