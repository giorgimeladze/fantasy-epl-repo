// Mirror of server/src/models/team.ts and server/src/models/auth.ts — keep in sync.

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface Club {
  id: number;
  name: string;
  shortName: string;
}

export interface UpcomingFixture {
  gameweek: number;
  opponent: string;
  isHome: boolean;
  difficulty: number;
  kickoffTime: string | null;
}

export interface PlayerView {
  id: number;
  webName: string;
  fullName: string;
  position: Position;
  club: Club;
  pickPosition: number;
  isStarter: boolean;
  isCaptain: boolean;
  isViceCaptain: boolean;
  multiplier: number;
  price: number;
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
  gameweekPoints: number;
  pointsForMe: number;
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
  bank: number;
  teamValue: number;
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

export interface CacheInfo {
  fromCache: boolean;
  fetchedAt: string;
  expiresAt: string;
}

export interface MyTeamResponse {
  manager: ManagerSummary;
  gameweek: GameweekInfo;
  players: PlayerView[];
  cache: CacheInfo;
}

export interface LoginResponse {
  token: string;
  username: string;
  expiresAt: string;
}
