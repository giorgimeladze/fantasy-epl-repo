// Response contract for GET /api/head-to-head. Mirrored in client/src/types.ts.
import type { CacheInfo, Position, UpcomingFixture } from './team.js';

/** One player's stats in one past fixture, normalised from either data source. */
export interface FixtureRecord {
  season: string; // e.g. "2025-26"
  playerCode: number;
  fixtureId: number;
  kickoffTime: string | null;
  gameweek: number | null;
  teamShortName: string | null; // the player's club at the time
  opponentCode: number;
  opponentShortName: string;
  wasHome: boolean;
  teamHScore: number | null;
  teamAScore: number | null;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  goalsConceded: number;
  ownGoals: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  bonus: number;
  bps: number;
  totalPoints: number;
  expectedGoals: number | null;
  expectedAssists: number | null;
  defensiveContribution: number | null; // tracked from 2025-26 onwards
}

export type InsightTone = 'good' | 'bad';

export interface Insight {
  label: string;
  tone: InsightTone;
}

export interface HeadToHeadMatch extends Omit<FixtureRecord, 'playerCode' | 'opponentCode'> {
  result: 'W' | 'D' | 'L' | null; // from the player's side
  insights: Insight[];
}

export type Verdict = 'good' | 'average' | 'poor' | 'none';

export interface HeadToHeadSummary {
  matches: number;
  averagePoints: number;
  totalPoints: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  bonus: number;
  cards: number;
  verdict: Verdict;
}

export interface PlayerHeadToHead {
  player: {
    id: number;
    webName: string;
    position: Position;
    clubShortName: string;
    pickPosition: number | null; // null when the player isn't in the manager's squad
    isStarter: boolean;
  };
  nextFixture: UpcomingFixture | null;
  matches: HeadToHeadMatch[]; // most recent first
  summary: HeadToHeadSummary;
}

export interface HeadToHeadResponse {
  gameweek: number;
  seasonsCovered: string[]; // seasons with data available, newest first
  players: PlayerHeadToHead[];
  cache: CacheInfo;
}

/** GET /api/head-to-head/players/:id — any Premier League player, not just the squad. */
export interface PlayerHeadToHeadResponse extends PlayerHeadToHead {
  seasonsCovered: string[];
  cache: CacheInfo;
}

export interface ScoutPlayerOption {
  id: number;
  webName: string;
  fullName: string;
  position: Position;
}

export interface ScoutClubOption {
  id: number;
  name: string;
  shortName: string;
  players: ScoutPlayerOption[]; // GK, DEF, MID, FWD, then by name
}

/** GET /api/head-to-head/options — clubs and their players for the scout picker. */
export interface ScoutOptionsResponse {
  clubs: ScoutClubOption[]; // by name
}
