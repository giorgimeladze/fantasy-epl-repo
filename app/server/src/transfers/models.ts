// Response contract for GET /api/transfers. Re-exported to the client by app/client/src/types.ts: types only.
import type { CacheInfo, Position } from '../team/models.js';

export interface TransferPlayer {
  id: number;
  webName: string;
  position: Position;
  clubShortName: string;
  price: number; // £m, today's price
  form: number; // FPL form (points per match over the last 30 days)
  status: string;
  news: string;
  playChance: number; // 0–1, next gameweek
  gameweekPoints: number[]; // predicted, one per gameweek in TransfersResponse.gameweeks
  horizonPoints: number; // sum of gameweekPoints
  reasons: string[]; // short phrases: fixtures, form, availability, point sources, head-to-head
}

export interface TransferMove {
  out: TransferPlayer;
  in: TransferPlayer;
  sellingPrice: number; // £m, what `out` is estimated to sell for
  gain: number; // in.horizonPoints − out.horizonPoints (the squad gain is on TransferOption)
}

export interface TransferOption {
  moves: TransferMove[]; // empty = save the transfer
  /** Predicted points over the horizon against keeping the squad (best XI, captain and autosubs each week). */
  gain: number;
  gainPerGameweek: number[];
  hitCost: number; // points: 4 per transfer beyond the free ones
  netGain: number; // gain − hitCost
  freeTransfersNext: number; // free transfers the following gameweek
  bankAfter: number; // £m
  /** netGain minus the value of the banked free transfers given up; the recommendation scores highest. */
  score: number;
}

export interface FreeTransferWeek {
  gameweek: number;
  transfers: number;
  chip: string | null; // "wildcard", "freehit", "bboost", "3xc", …
  freeAfter: number; // free transfers for the following gameweek
}

export interface SquadSale {
  id: number;
  webName: string;
  position: Position;
  clubShortName: string;
  price: number; // £m, today's price
  purchasePrice: number; // £m
  sellingPrice: number; // £m: purchase price + half of any rise, rounded down to £0.1m
  boughtInGameweek: number | null; // null = in the first squad (price taken from the season start)
}

export interface TransfersResponse {
  gameweek: number; // the gameweek the transfers are for
  gameweeks: number[]; // the planning horizon, starting with `gameweek`
  freeTransfers: number;
  maxFreeTransfers: number;
  freeTransferHistory: FreeTransferWeek[]; // oldest first
  bank: number; // £m
  squad: SquadSale[]; // by position, then selling price
  /** The current squad's predicted points over the horizon. */
  squadPoints: number;
  recommended: TransferOption;
  save: TransferOption;
  single: TransferOption[]; // best 1-transfer options, by score
  double: TransferOption[]; // best 2-transfer options, by score (each move adds to the other)
  rules: {
    hitCost: number;
    maxPerClub: number;
    savedTransferValue: number; // points a banked free transfer is taken to be worth
    candidatesPerPosition: number;
  };
  cache: CacheInfo;
}
