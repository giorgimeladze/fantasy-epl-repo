import { config } from '../config/index.js';
import { cachedResponse } from '../db/responseCache.js';
import { fplClient } from '../fpl/fplClient.js';
import type { FplElement } from '../fpl/models.js';
import type { PlayerProjection } from '../projections/models.js';
import { projectionService } from '../projections/projectionService.js';
import type { Position } from '../team/models.js';
import { teamService } from '../team/teamService.js';
import { HttpError } from '../utils/http.js';
import { countFreeTransfers } from './freeTransfers.js';
import type { SquadSale, TransferOption, TransferPlayer, TransfersResponse } from './models.js';
import { transferReasons } from './reasons.js';
import { sellingPrice } from './sellingPrices.js';
import { candidatePool, searchTransfers, type SquadPlayer, type TransferPlan } from './transferSearch.js';

type TransfersSnapshot = Omit<TransfersResponse, 'cache'>;

// `+ 0` turns −0 into 0, so a JSON round trip (the cache) gives the same value.
const round2 = (value: number): number => Math.round(value * 100) / 100 + 0;
const tenths = (value: number): number => value / 10;
const num = (value: string): number => Number.parseFloat(value) || 0;
const POSITION_ORDER: Record<Position, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

function toSquadPlayer(p: PlayerProjection, price: number): SquadPlayer {
  return {
    id: p.id,
    position: p.position,
    club: p.clubShortName,
    price,
    gameweeks: p.gameweeks.map((g) => ({ points: g.points, playChance: g.playChance })),
  };
}

async function buildSnapshot(teamId: number, forceRefresh: boolean): Promise<TransfersSnapshot> {
  // Projections first: they refresh the team too, so the team call below is answered from the cache.
  const { gameweeks, players } = await projectionService.getLeagueProjections(teamId, { forceRefresh });
  const [team, bootstrap, history, transfers] = await Promise.all([
    teamService.getMyTeam(teamId),
    fplClient.getBootstrap(),
    fplClient.getEntryHistory(teamId),
    fplClient.getTransfers(teamId),
  ]);

  const gameweek = gameweeks[0];
  if (gameweek === undefined) throw new HttpError(404, 'There are no gameweeks left to plan this season.');
  const lastPlayed = [...history.current].sort((a, b) => b.event - a.event)[0];
  if (!lastPlayed) throw new HttpError(404, 'This FPL team has no gameweeks played yet.');

  const elements = new Map<number, FplElement>(bootstrap.elements.map((e) => [e.id, e]));
  const formOf = (id: number) => num(elements.get(id)?.form ?? '');
  const { maxFreeTransfers, ...transferConfig } = config.transfers;
  const freeTransfers = countFreeTransfers(history.current, history.chips, maxFreeTransfers);

  // Free Hit squads are handed back after a week, so their transfers don't set a purchase price.
  const freeHitWeeks = new Set(history.chips.filter((c) => c.name === 'freehit').map((c) => c.event));
  const lasting = transfers.filter((t) => !freeHitWeeks.has(t.event));

  const squadSales: SquadSale[] = [];
  const squad: SquadPlayer[] = [];
  for (const pick of team.players) {
    const element = elements.get(pick.id);
    const projection = players.get(pick.id);
    if (!element || !projection) continue;
    const sale = sellingPrice(element, lasting);
    squad.push(toSquadPlayer(projection, sale.sellingPrice));
    squadSales.push({
      id: pick.id,
      webName: projection.webName,
      position: projection.position,
      clubShortName: projection.clubShortName,
      price: tenths(element.now_cost),
      purchasePrice: tenths(sale.purchasePrice),
      sellingPrice: tenths(sale.sellingPrice),
      boughtInGameweek: sale.boughtInGameweek,
    });
  }
  squadSales.sort(
    (a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position] || b.sellingPrice - a.sellingPrice,
  );

  const bank = lastPlayed.bank;
  const topSales = squad
    .map((p) => p.price)
    .sort((a, b) => b - a)
    .slice(0, transferConfig.maxTransfers);
  const league = [...players.values()].flatMap((p) => {
    const element = elements.get(p.id);
    return element ? [toSquadPlayer(p, element.now_cost)] : [];
  });
  const pool = candidatePool(
    league,
    squad,
    bank + topSales.reduce((a, b) => a + b, 0),
    transferConfig.candidatesPerPosition,
  );

  const result = searchTransfers(squad, pool, {
    ...transferConfig,
    bank,
    freeTransfers: freeTransfers.available,
    maxFreeTransfers,
  });

  const views = new Map<number, TransferPlayer>();
  const view = (id: number): TransferPlayer => {
    const existing = views.get(id);
    if (existing) return existing;
    const p = players.get(id)!;
    const created: TransferPlayer = {
      id,
      webName: p.webName,
      position: p.position,
      clubShortName: p.clubShortName,
      price: p.price,
      form: formOf(id),
      status: p.status,
      news: p.news,
      playChance: p.gameweeks[0]?.playChance ?? 0,
      gameweekPoints: p.gameweeks.map((g) => g.points),
      horizonPoints: p.horizonPoints,
      reasons: transferReasons(p, formOf(id)),
    };
    views.set(id, created);
    return created;
  };
  const salesById = new Map(squadSales.map((s) => [s.id, s]));
  const option = (plan: TransferPlan): TransferOption => ({
    moves: plan.moves.map((m) => {
      const [out, incoming] = [view(m.outId), view(m.inId)];
      return {
        out,
        in: incoming,
        sellingPrice: salesById.get(m.outId)!.sellingPrice,
        gain: round2(incoming.horizonPoints - out.horizonPoints),
      };
    }),
    gain: round2(plan.gain),
    gainPerGameweek: plan.perGameweek.map((points, i) => round2(points - result.baseline[i]!)),
    hitCost: plan.hitCost,
    netGain: round2(plan.netGain),
    freeTransfersNext: plan.freeTransfersNext,
    bankAfter: tenths(plan.bankAfter),
    score: round2(plan.score),
  });

  return {
    gameweek,
    gameweeks,
    freeTransfers: freeTransfers.available,
    maxFreeTransfers,
    freeTransferHistory: freeTransfers.weeks,
    bank: tenths(bank),
    squad: squadSales,
    squadPoints: round2(result.baseline.reduce((a, b) => a + b, 0)),
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
