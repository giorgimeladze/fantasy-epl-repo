// Response contract for GET /api/next-gameweek. Re-exported to the client by app/client/src/types.ts.
import type { PlayerProjection } from '../projections/models.js';
import type { CacheInfo, Position } from '../team/models.js';

export interface LineupFixture {
  opponent: string; // short name
  isHome: boolean;
  difficulty: number; // FDR 1–5
}

export interface LineupPlayer {
  id: number;
  webName: string;
  position: Position;
  clubShortName: string;
  points: number; // predicted for the gameweek (0 in a blank)
  playChance: number; // 0–1
  status: string;
  news: string;
  fixtures: LineupFixture[]; // empty = blank, 2 = double gameweek
  reasons: string[]; // short phrases, e.g. "vs WOL (H)", "goals 1.9"
}

export interface LineupChoice {
  formation: string; // "4-4-2"
  starters: LineupPlayer[]; // GK, DEF, MID, FWD; by points within a position
  bench: LineupPlayer[]; // backup goalkeeper first, then substitution order
  captainId: number;
  viceCaptainId: number;
  /** Predicted points: starters + captain + automatic substitutions. */
  expectedPoints: number;
  captainPoints: number; // extra points from the armband (incl. the vice-captain covering)
  autosubPoints: number; // expected points from bench players coming on
}

export interface LineupChange {
  in: LineupPlayer;
  out: LineupPlayer;
  gain: number; // in.points − out.points
}

export interface CaptainOption {
  player: LineupPlayer;
  /** Extra points the armband is predicted to add with this captain and the best vice-captain. */
  captainPoints: number;
}

export interface FormationOption {
  formation: string;
  expectedPoints: number; // best XI in this formation
}

export interface PriceHint {
  id: number;
  webName: string;
  position: Position;
  clubShortName: string;
  price: number; // £m
  direction: 'rise' | 'fall';
  chance: 'likely' | 'possible';
  /** Price updates from now until FPL expects it (0 = the next one, normally tonight). */
  updatesAway: number;
  progressPercent: number; // FPL's progress towards the change (±100 = it changes)
  netTransfers: number; // transfers in − out this gameweek
  changeThisGameweek: number; // £m, already happened
  inSquad: boolean;
}

export interface PriceWatch {
  available: boolean; // false when FPL isn't publishing its price-change data
  squad: PriceHint[];
  risers: PriceHint[];
  fallers: PriceHint[];
}

export interface NextGameweekResponse {
  gameweek: number; // the gameweek the lineup is for
  deadline: string | null;
  /** The lineup compared against: FPL only shows next gameweek's picks after the deadline. */
  comparedWithGameweek: number;
  best: LineupChoice;
  current: LineupChoice;
  gain: number; // best.expectedPoints − current.expectedPoints
  changes: LineupChange[]; // starters to swap in / out
  captainChange: { from: LineupPlayer; to: LineupPlayer } | null;
  benchOrderChanged: boolean;
  captainOptions: CaptainOption[]; // best first
  formations: FormationOption[]; // every legal formation, best first
  priceWatch: PriceWatch;
  differentials: Record<Position, PlayerProjection[]>;
  cache: CacheInfo;
}
