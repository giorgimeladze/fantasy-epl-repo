// Loads everything a transfer decision needs: every player's projection, the squad at its selling
// prices, the bank and the free transfers. Shared by transfers/ and planner/.
import { config } from '../config/index.js';
import { fplClient } from '../fpl/fplClient.js';
import type { FplBootstrap, FplChipPlay, FplElement } from '../fpl/models.js';
import type { PlayerProjection } from '../projections/models.js';
import { projectionService } from '../projections/projectionService.js';
import type { Position } from '../team/models.js';
import { teamService } from '../team/teamService.js';
import { HttpError } from '../utils/http.js';
import { countFreeTransfers, type FreeTransferCount } from './freeTransfers.js';
import type { SquadSale, TransferPlayer } from './models.js';
import { transferReasons } from './reasons.js';
import { sellingPrice } from './sellingPrices.js';
import type { SquadPlayer } from './transferSearch.js';

const tenths = (value: number): number => value / 10;
const num = (value: string): number => Number.parseFloat(value) || 0;
const POSITION_ORDER: Record<Position, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

export interface TransferContext {
  gameweek: number; // the next gameweek
  gameweeks: number[]; // the horizon, starting with `gameweek`
  bootstrap: FplBootstrap;
  players: Map<number, PlayerProjection>; // every player, by id
  /** Every player as a search candidate, at today's price. */
  league: SquadPlayer[];
  /** The squad at its selling prices. */
  squad: SquadPlayer[];
  squadSales: SquadSale[]; // by position, then selling price
  bank: number; // tenths of £m
  freeTransfers: FreeTransferCount;
  chipsPlayed: FplChipPlay[];
  /** The explained view of a player for the response. */
  view: (id: number) => TransferPlayer;
}

export function toSquadPlayer(p: PlayerProjection, price: number): SquadPlayer {
  return {
    id: p.id,
    position: p.position,
    club: p.clubShortName,
    price,
    gameweeks: p.gameweeks.map((g) => ({ points: g.points, playChance: g.playChance })),
  };
}

export async function loadTransferContext(teamId: number, forceRefresh: boolean): Promise<TransferContext> {
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
  const freeTransfers = countFreeTransfers(history.current, history.chips, config.transfers.maxFreeTransfers);

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
  squadSales.sort((a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position] || b.sellingPrice - a.sellingPrice);

  const league = [...players.values()].flatMap((p) => {
    const element = elements.get(p.id);
    return element ? [toSquadPlayer(p, element.now_cost)] : [];
  });

  const formOf = (id: number) => num(elements.get(id)?.form ?? '');
  const views = new Map<number, TransferPlayer>();
  const view = (id: number): TransferPlayer => {
    const existing = views.get(id);
    if (existing) return existing;
    const p = players.get(id);
    if (!p) throw new HttpError(400, `Unknown player ${id}`);
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

  return {
    gameweek,
    gameweeks,
    bootstrap,
    players,
    league,
    squad,
    squadSales,
    bank: lastPlayed.bank,
    freeTransfers,
    chipsPlayed: history.chips,
    view,
  };
}
