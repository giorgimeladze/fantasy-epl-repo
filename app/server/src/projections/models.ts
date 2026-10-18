// Response contract for GET /api/projections. Re-exported by app/client/src/types.ts: types only.
import type { CacheInfo, Position } from '../team/models.js';

/** Expected FPL points from each scoring rule, for one fixture. Sums to `points`. */
export interface PointsBreakdown {
  appearance: number;
  goals: number;
  assists: number;
  cleanSheet: number;
  goalsConceded: number; // ≤ 0
  saves: number;
  bonus: number;
  defensiveContribution: number;
  cards: number; // ≤ 0
}

export interface FixtureProjection {
  opponent: string; // short name
  isHome: boolean;
  difficulty: number; // FPL's FDR 1–5, for display
  points: number;
  breakdown: PointsBreakdown;
  expectedMinutes: number;
  startChance: number; // 0–1
  playChance: number; // 0–1, starts or comes on as a sub
  cleanSheetChance: number; // 0–1, the club keeping one (whether or not the player is on the pitch)
  expectedGoals: number; // the player's
  expectedAssists: number;
  /** Multiplier on goals, assists and bonus from the record against this opponent (1 = no effect). */
  headToHeadFactor: number;
}

export interface GameweekProjection {
  gameweek: number;
  points: number; // sum over fixtures; 0 in a blank gameweek
  playChance: number; // 0–1, plays in at least one fixture; 0 in a blank gameweek
  fixtures: FixtureProjection[]; // empty = blank, 2 = double gameweek
}

export interface PlayerProjection {
  id: number;
  webName: string;
  position: Position;
  clubShortName: string;
  price: number; // £m
  status: string; // FPL: "a" available, "d" doubtful, "i" injured, "s" suspended, "u" unavailable
  news: string;
  chanceOfPlaying: number | null; // FPL's % chance of playing next round; null = no flag
  pickPosition: number | null; // null when not in the manager's squad
  fplExpectedPoints: number | null; // FPL's own forecast for the next gameweek (ep_next)
  selectedByPercent: number; // share of FPL managers who own the player
  gameweeks: GameweekProjection[]; // one per gameweek in ProjectionsResponse.gameweeks
  nextGameweekPoints: number;
  horizonPoints: number; // sum over all gameweeks
}

export interface ProjectionsResponse {
  gameweeks: number[]; // the gameweeks projected, starting with the next one
  squad: PlayerProjection[]; // by pick position
  /** Highest `horizonPoints` per position across the league, squad players included. */
  top: Record<Position, PlayerProjection[]>;
  /** Players not in the squad, owned by under config.projections.differentialMaxOwnership %, by `horizonPoints`. */
  differentials: Record<Position, PlayerProjection[]>;
  cache: CacheInfo;
}
