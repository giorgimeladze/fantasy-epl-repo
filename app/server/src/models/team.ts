// Response contract for GET /api/team. Mirrored in client/src/types.ts.

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface Club {
  id: number;
  name: string;
  shortName: string;
}

export interface UpcomingFixture {
  gameweek: number;
  opponent: string; // short name, e.g. "ARS"
  isHome: boolean;
  difficulty: number; // FDR 1–5
  kickoffTime: string | null;
}

export interface PlayerView {
  id: number;
  webName: string;
  fullName: string;
  position: Position;
  club: Club;

  // Selection for the current gameweek
  pickPosition: number;
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;

  // Season stats (from FPL)
  price: number; // £m
  form: number;
  pointsPerGame: number;
  totalPoints: number;
  minutes: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  bonus: number;
  ictIndex: number;
  expectedGoals: number;
  expectedAssists: number;
  selectedByPercent: number;

  // Points
  gameweekPoints: number; // raw points this gameweek (before multiplier)
  pointsForMe: number; // season points contributed to this manager (multipliers applied)

  // Availability
  status: string;
  news: string;
  chanceOfPlayingNextRound: number | null;

  nextFixtures: UpcomingFixture[];
}

export interface ManagerSummary {
  teamId: number;
  teamName: string;
  managerName: string;
  overallPoints: number;
  overallRank: number | null;
  gameweekPoints: number;
  bank: number; // £m
  teamValue: number; // £m
  activeChip: string | null;
  transfersCost: number;
  pointsOnBench: number;
}

export interface GameweekInfo {
  id: number;
  name: string;
  deadline: string;
  finished: boolean;
}

/** What is assembled from the FPL API and stored in the SQLite team cache. */
export interface TeamSnapshot {
  manager: ManagerSummary;
  gameweek: GameweekInfo;
  players: PlayerView[]; // sorted by pickPosition (1–15)
}

export interface CacheInfo {
  fromCache: boolean;
  fetchedAt: string; // ISO — when the data was fetched from FPL
  expiresAt: string; // ISO — after this the next request refetches
}

export interface MyTeamResponse extends TeamSnapshot {
  cache: CacheInfo;
}
