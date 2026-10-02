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

// Mirror of server/src/models/headToHead.ts — keep in sync.

export interface Insight {
  label: string;
  tone: 'good' | 'bad';
}

export interface HeadToHeadMatch {
  season: string;
  fixtureId: number;
  kickoffTime: string | null;
  gameweek: number | null;
  teamShortName: string | null;
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
  defensiveContribution: number | null;
  result: 'W' | 'D' | 'L' | null;
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
    pickPosition: number;
    isStarter: boolean;
  };
  nextFixture: UpcomingFixture | null;
  matches: HeadToHeadMatch[];
  summary: HeadToHeadSummary;
}

export interface HeadToHeadResponse {
  gameweek: number;
  seasonsCovered: string[];
  players: PlayerHeadToHead[];
  cache: CacheInfo;
}
