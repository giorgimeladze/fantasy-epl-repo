import { config } from '../config/index.js';
import { cachedResponse } from '../db/responseCache.js';
import type { TransferOption, TransfersResponse } from './models.js';
import { loadTransferContext, type TransferContext } from './transferContext.js';
import { candidatePool, searchTransfers, type TransferPlan, type TransferSearchResult } from './transferSearch.js';

type TransfersSnapshot = Omit<TransfersResponse, 'cache'>;

// `+ 0` turns −0 into 0, so a JSON round trip (the cache) gives the same value.
const round2 = (value: number): number => Math.round(value * 100) / 100 + 0;
const tenths = (value: number): number => value / 10;

/** The response view of a plan; `baseline` is the squad's points per gameweek without it. */
export function transferOption(
  plan: TransferPlan,
  baseline: readonly number[],
  context: TransferContext,
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

/** The Transfers page's search: the best 0, 1 or 2 transfers for the context's squad. */
export function searchFromContext(context: TransferContext): TransferSearchResult {
  const { squad, bank, freeTransfers } = context;
  const { maxFreeTransfers, ...transferConfig } = config.transfers;

  const topSales = squad
    .map((p) => p.price)
    .sort((a, b) => b - a)
    .slice(0, transferConfig.maxTransfers);
  const pool = candidatePool(
    context.league,
    squad,
    bank + topSales.reduce((a, b) => a + b, 0),
    transferConfig.candidatesPerPosition,
  );
  return searchTransfers(squad, pool, {
    ...transferConfig,
    bank,
    freeTransfers: freeTransfers.available,
    maxFreeTransfers,
  });
}

async function buildSnapshot(teamId: number, forceRefresh: boolean): Promise<TransfersSnapshot> {
  const context = await loadTransferContext(teamId, forceRefresh);
  const { bank, freeTransfers } = context;
  const { maxFreeTransfers, ...transferConfig } = config.transfers;
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
    squadPoints: round2(result.baseline.reduce((a, b) => a + b, 0)),
    squadPerGameweek: result.baseline.map(round2),
    recommended: option(result.recommended),
    save: option(result.save),
    single: result.single.map(option),
    double: result.double.map(option),
    rules: {
      hitCost: transferConfig.hitCost,
      maxPerClub: transferConfig.maxPerClub,
      savedTransferValue: transferConfig.savedTransferValue,
      candidatesPerPosition: transferConfig.candidatesPerPosition,
    },
  };
}

export const transferService = {
  /**
   * Transfer suggestions for the next gameweek (0, 1 or 2 moves) with free transfers, selling prices
   * and the budget worked out from the public FPL data. Cached in SQLite for config.db.cacheTtlMs.
   */
  getTransfers(
    teamId: number = config.fpl.teamId,
    { forceRefresh = false }: { forceRefresh?: boolean } = {},
  ): Promise<TransfersResponse> {
    return cachedResponse(`transfers:${teamId}`, config.db.cacheTtlMs, forceRefresh, () =>
      buildSnapshot(teamId, forceRefresh),
    );
  },
};
