// Response contracts for /api/planner and /api/planner/draft. Re-exported by app/client/src/types.ts: types only.
import type { CacheInfo, Position } from '../team/models.js';
import type { TransferOption } from '../transfers/models.js';

export type ChipName = 'wildcard' | 'freehit' | 'bboost' | '3xc';

/** A player as the planner shows them. */
export interface PlannerPlayer {
  id: number;
  webName: string;
  position: Position;
  clubShortName: string;
  price: number; // £m
  points: number; // predicted: for the gameweek in question, or over the horizon
}

export interface ChipStatus {
  name: ChipName;
  label: string; // "Bench Boost"
  available: boolean;
  /** Last gameweek of the chip's current window (FPL gives each chip once per half since 2025-26). */
  availableUntil: number | null;
  playedInGameweek: number | null; // in the current window
}

export interface ChipWeek {
  gameweek: number;
  value: number; // extra predicted points from playing the chip this gameweek
  /** How the value adds up, e.g. "bench 9.1 − 0.6 already expected from autosubs". */
  explanation: string;
  players: PlannerPlayer[]; // the bench (Bench Boost), the captain (Triple Captain), players brought in (Free Hit, Wildcard)
}

export interface ChipAdvice {
  chip: ChipStatus;
  bestGameweek: number | null; // null = not worth it within the horizon (or not available)
  verdict: string;
  /** How the numbers are worked out. */
  method: string;
  weeks: ChipWeek[]; // one per gameweek in the horizon
  /** Wildcard only: the squad it would build now, against the best normal transfers. */
  wildcard?: {
    in: PlannerPlayer[];
    out: PlannerPlayer[];
    gain: number; // over the horizon, against keeping the squad
    bestTransfersGain: number; // the Transfers page's recommendation (net of hits)
    bankAfter: number; // £m
  };
}

export interface RotationWeek {
  gameweek: number;
  pick: string; // club short name to play
  value: number; // the better of the two
  other: number;
}

export interface RotationPair {
  clubs: [string, string];
  total: number; // sum over the horizon of the better club each gameweek
  bestSingle: number; // the better club on its own, every week (total − bestSingle = what rotating adds)
  weeks: RotationWeek[];
  players: PlannerPlayer[]; // goalkeepers: the pair to buy; empty for defences
  price: number; // £m, goalkeepers only (0 for defences)
}

export interface Rotation {
  /** Pairs of clubs' first-choice goalkeepers, by predicted points each week. */
  goalkeepers: RotationPair[];
  /** Pairs of defences, by expected clean sheets each week (doubles count twice). */
  defences: RotationPair[];
}

export interface PlannerResponse {
  gameweek: number;
  gameweeks: number[];
  chips: ChipAdvice[]; // Wildcard, Free Hit, Bench Boost, Triple Captain
  rotation: Rotation;
  cache: CacheInfo;
}

// ── Draft plan ────────────────────────────────────────────────────────────────

export interface PlannedTransfer {
  gameweek: number;
  outId: number;
  inId: number;
}

/** The body of PUT /api/planner/draft. */
export interface DraftPlanRequest {
  transfers: PlannedTransfer[];
}

export interface MarketPlayer {
  id: number;
  webName: string;
  position: Position;
  clubShortName: string;
  price: number; // £m, today's
  gameweekPoints: number[]; // one per gameweek in the horizon
  horizonPoints: number;
}

export interface DraftMove {
  out: MarketPlayer;
  in: MarketPlayer;
  sellingPrice: number; // £m
  buyingPrice: number; // £m
}

export interface DraftLineup {
  formation: string;
  captainId: number;
  /** startersPoints + captainPoints + autosubPoints. */
  expectedPoints: number;
  startersPoints: number;
  captainPoints: number;
  autosubPoints: number;
}

export interface DraftWeek {
  gameweek: number;
  moves: DraftMove[];
  freeTransfers: number; // available before this week's transfers
  hitCost: number;
  bankAfter: number; // £m
  squad: number[]; // player ids after the transfers
  lineup: DraftLineup; // the best XI, captain and bench for the planned squad
  baselinePoints: number; // the same for the squad with no transfers
  netPoints: number; // lineup.expectedPoints − hitCost
  /** The best single transfer from this squad for the rest of the horizon, if one beats saving. */
  suggestion: TransferOption | null;
}

export interface DraftPlanResponse {
  gameweek: number;
  gameweeks: number[];
  transfers: PlannedTransfer[]; // the saved plan (past gameweeks and broken moves dropped)
  weeks: DraftWeek[];
  totalPoints: number; // sum of netPoints
  baselinePoints: number; // the squad with no transfers
  gain: number; // totalPoints − baselinePoints
  warnings: string[]; // saved moves that no longer work (e.g. the player was sold for real)
  squad: MarketPlayer[]; // the current squad
  market: Record<Position, MarketPlayer[]>; // best players per position by predicted points over the horizon
  updatedAt: string | null;
}
