// Pure predicted-points model (spec 003). No I/O: projectionService feeds it live FPL data and
// backtest feeds it past seasons, so both are scored by exactly the same rules.
import type { OpponentRecord } from '../history/fixtureHistoryRepository.js';
import type { PointsBreakdown } from './models.js';
import type { Position } from '../team/models.js';

// FPL 2025-26 scoring rules.
const GOAL_POINTS: Record<Position, number> = { GK: 10, DEF: 6, MID: 5, FWD: 4 };
const ASSIST_POINTS = 3;
const CLEAN_SHEET_POINTS: Record<Position, number> = { GK: 4, DEF: 4, MID: 1, FWD: 0 };
const DEFENSIVE_CONTRIBUTION_THRESHOLD: Record<Position, number | null> = { GK: null, DEF: 10, MID: 12, FWD: 12 };
const DEFENSIVE_CONTRIBUTION_POINTS = 2;

// Rough league averages per 90 minutes for regular starters, used before a player has their own data.
interface Rates {
  expectedGoals: number;
  expectedAssists: number;
  bonus: number;
  saves: number;
  yellowCards: number;
  redCards: number;
  defensiveContribution: number;
}
const POSITION_RATES: Record<Position, Rates> = {
  GK: {
    expectedGoals: 0,
    expectedAssists: 0.01,
    bonus: 0.25,
    saves: 2.8,
    yellowCards: 0.04,
    redCards: 0.003,
    defensiveContribution: 0,
  },
  DEF: {
    expectedGoals: 0.05,
    expectedAssists: 0.07,
    bonus: 0.25,
    saves: 0,
    yellowCards: 0.15,
    redCards: 0.005,
    defensiveContribution: 8.5,
  },
  MID: {
    expectedGoals: 0.15,
    expectedAssists: 0.14,
    bonus: 0.25,
    saves: 0,
    yellowCards: 0.16,
    redCards: 0.004,
    defensiveContribution: 7.5,
  },
  FWD: {
    expectedGoals: 0.35,
    expectedAssists: 0.1,
    bonus: 0.3,
    saves: 0,
    yellowCards: 0.1,
    redCards: 0.003,
    defensiveContribution: 3.5,
  },
};

// How strongly earlier data steadies this season's numbers, in minutes / matches of "virtual" data.
const PRIOR_WEIGHT_MINUTES = 900;
const PRIOR_MIN_MINUTES = 450; // last season counts as a player's own prior from this many minutes
const START_PRIOR_MATCHES = 2;
const CLUB_PRIOR_MATCHES = 6;
const SEASON_MATCHES = 38;

const DEFAULT_START_SHARE = 0.5;
const DEFAULT_MINUTES_PER_START = 75;
const SUB_APPEARANCE_CHANCE = 0.35; // outfield players who don't start
const SUB_MINUTES = 20;
const MAX_SIXTY_MINUTE_CHANCE = 0.95;

const DEFAULT_GOALS_PER_MATCH = 1.4;
const HOME_ADVANTAGE = 1.1; // multiplies the home side's goals; the away side's is divided by it

// Head-to-head adjustment: at most ±15 %, weighted by how many meetings there were.
export const HEAD_TO_HEAD_WEIGHT = 0.3;
const HEAD_TO_HEAD_MIN_MEETINGS = 2;
const HEAD_TO_HEAD_LIMIT = 0.15;

/** A player's totals over some period (this season so far, or last season). */
export interface PlayerSample {
  minutes: number;
  starts: number;
  expectedGoals: number;
  expectedAssists: number;
  bonus: number;
  saves: number;
  yellowCards: number;
  redCards: number;
  defensiveContribution: number | null; // null when not tracked (before 2025-26)
}

export interface ModelPlayer {
  position: Position;
  current: PlayerSample;
  prior: PlayerSample | null; // last season, if they played in the Premier League
  clubMatches: number; // matches the player's club has played this season
}

/** Totals for one club's matches so far: xG for and against. */
export interface ClubTotals {
  matches: number;
  goalsFor: number;
  goalsAgainst: number;
}

/** 1 = league average. Higher attack scores more; higher defence concedes more. */
export interface ClubStrength {
  attack: number;
  defence: number;
}

export interface League {
  goalsPerMatch: number; // per club per match
  strengths: Map<string, ClubStrength>;
}

export interface ModelFixture {
  isHome: boolean;
  club: ClubStrength;
  opponent: ClubStrength;
  headToHeadFactor: number;
}

export interface FixtureEstimate {
  points: number;
  breakdown: PointsBreakdown;
  expectedMinutes: number;
  startChance: number;
  cleanSheetChance: number;
  expectedGoals: number;
  expectedAssists: number;
}

const AVERAGE_CLUB: ClubStrength = { attack: 1, defence: 1 };

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Club attack and defence relative to the league average, steadied towards 1 early in the season. */
export function clubStrengths(totals: Map<string, ClubTotals>): League {
  let matches = 0;
  let goals = 0;
  for (const t of totals.values()) {
    matches += t.matches;
    goals += t.goalsFor;
  }
  const goalsPerMatch = matches > 0 && goals > 0 ? goals / matches : DEFAULT_GOALS_PER_MATCH;

  const strengths = new Map<string, ClubStrength>();
  for (const [club, t] of totals) {
    const steadied = (value: number) =>
      (value + CLUB_PRIOR_MATCHES * goalsPerMatch) / (t.matches + CLUB_PRIOR_MATCHES) / goalsPerMatch;
    strengths.set(club, { attack: steadied(t.goalsFor), defence: steadied(t.goalsAgainst) });
  }
  return { goalsPerMatch, strengths };
}

export function strengthOf(league: League, club: string): ClubStrength {
  return league.strengths.get(club) ?? AVERAGE_CLUB;
}

/** Multiplier for goals, assists and bonus from a player's record against this opponent. */
export function headToHeadFactor(
  record: OpponentRecord | undefined,
  overallAverage: number | undefined,
  weight: number = HEAD_TO_HEAD_WEIGHT,
): number {
  if (!record || record.meetings < HEAD_TO_HEAD_MIN_MEETINGS || !overallAverage || overallAverage <= 0) return 1;
  const ratio = record.averagePoints / overallAverage;
  const confidence = weight * (record.meetings / (record.meetings + 4));
  return clamp(1 + confidence * (ratio - 1), 1 - HEAD_TO_HEAD_LIMIT, 1 + HEAD_TO_HEAD_LIMIT);
}

/** Per-90 rate from this season, steadied with last season (or the position average). */
function per90(player: ModelPlayer, pick: (s: PlayerSample) => number | null, fallback: number): number {
  const { current, prior } = player;
  const priorValue = prior ? pick(prior) : null;
  const priorRate =
    prior && priorValue !== null && prior.minutes >= PRIOR_MIN_MINUTES ? (priorValue / prior.minutes) * 90 : fallback;
  const currentValue = pick(current) ?? (current.minutes / 90) * priorRate;
  return (currentValue * 90 + priorRate * PRIOR_WEIGHT_MINUTES) / (current.minutes + PRIOR_WEIGHT_MINUTES);
}

/** Share of the club's matches the player starts. */
function startShare(player: ModelPlayer): number {
  const { current, prior, clubMatches } = player;
  const priorShare = prior ? Math.min(1, prior.starts / SEASON_MATCHES) : DEFAULT_START_SHARE;
  return clamp((current.starts + START_PRIOR_MATCHES * priorShare) / (clubMatches + START_PRIOR_MATCHES), 0, 1);
}

function minutesPerStart(player: ModelPlayer): number {
  const { current, prior } = player;
  if (current.starts > 0) return Math.min(90, current.minutes / current.starts);
  if (prior && prior.starts > 0) return Math.min(90, prior.minutes / prior.starts);
  return DEFAULT_MINUTES_PER_START;
}

function poisson(mean: number, n: number): number {
  let p = Math.exp(-mean);
  for (let i = 1; i <= n; i++) p *= mean / i;
  return p;
}

/** E[floor(X / every)] for X ~ Poisson(mean): "1 point per 3 saves", "−1 per 2 goals conceded". */
function expectedPerEvery(mean: number, every: number): number {
  if (mean <= 0) return 0;
  const max = Math.ceil(mean + 10 * Math.sqrt(mean) + 10);
  let total = 0;
  for (let n = every; n <= max; n++) total += Math.floor(n / every) * poisson(mean, n);
  return total;
}

/** P(X ≥ threshold) for X ~ Poisson(mean). */
function chanceAtLeast(mean: number, threshold: number): number {
  let below = 0;
  for (let n = 0; n < threshold; n++) below += poisson(mean, n);
  return clamp(1 - below, 0, 1);
}

/**
 * Expected FPL points for one fixture. `availability` is the chance (0–1) the player is fit and
 * selectable, from FPL's injury and suspension flags.
 */
export function projectFixture(
  player: ModelPlayer,
  fixture: ModelFixture,
  league: Pick<League, 'goalsPerMatch'>,
  availability: number,
): FixtureEstimate {
  const { position } = player;
  const defaults = POSITION_RATES[position];
  const rate = (pick: (s: PlayerSample) => number | null, key: keyof Rates) => per90(player, pick, defaults[key]);

  // Minutes.
  const share = startShare(player);
  const perStart = minutesPerStart(player);
  const startChance = availability * share;
  const subChance = position === 'GK' ? 0 : availability * (1 - share) * SUB_APPEARANCE_CHANCE;
  const expectedMinutes = startChance * perStart + subChance * SUB_MINUTES;
  const sixtyChance = startChance * clamp((perStart - 30) / 55, 0, MAX_SIXTY_MINUTE_CHANCE);
  const share90 = expectedMinutes / 90;

  // Fixture: how many goals each side is expected to score.
  const venueFor = fixture.isHome ? HOME_ADVANTAGE : 1 / HOME_ADVANTAGE;
  const attackFactor = fixture.opponent.defence * venueFor;
  const goalsAgainst = (league.goalsPerMatch * fixture.opponent.attack * fixture.club.defence) / venueFor;
  const cleanSheetChance = Math.exp(-goalsAgainst);

  const expectedGoals =
    rate((s) => s.expectedGoals, 'expectedGoals') * share90 * attackFactor * fixture.headToHeadFactor;
  const expectedAssists =
    rate((s) => s.expectedAssists, 'expectedAssists') * share90 * attackFactor * fixture.headToHeadFactor;

  const defensive = position === 'GK' || position === 'DEF';
  const threshold = DEFENSIVE_CONTRIBUTION_THRESHOLD[position];
  const savesPerMatch = (rate((s) => s.saves, 'saves') * perStart * fixture.opponent.attack) / 90 / venueFor;
  const actionsPerMatch = (rate((s) => s.defensiveContribution, 'defensiveContribution') * perStart) / 90;

  const breakdown: PointsBreakdown = {
    appearance: startChance + subChance + sixtyChance,
    goals: expectedGoals * GOAL_POINTS[position],
    assists: expectedAssists * ASSIST_POINTS,
    cleanSheet: sixtyChance * cleanSheetChance * CLEAN_SHEET_POINTS[position],
    goalsConceded: defensive ? -sixtyChance * expectedPerEvery(goalsAgainst, 2) : 0,
    saves: position === 'GK' ? startChance * expectedPerEvery(savesPerMatch, 3) : 0,
    bonus: rate((s) => s.bonus, 'bonus') * share90 * fixture.headToHeadFactor,
    defensiveContribution:
      threshold === null ? 0 : startChance * chanceAtLeast(actionsPerMatch, threshold) * DEFENSIVE_CONTRIBUTION_POINTS,
    cards: -(rate((s) => s.yellowCards, 'yellowCards') + 3 * rate((s) => s.redCards, 'redCards')) * share90,
  };

  return {
    points: Object.values(breakdown).reduce((sum, v) => sum + v, 0),
    breakdown,
    expectedMinutes,
    startChance,
    cleanSheetChance,
    expectedGoals,
    expectedAssists,
  };
}

/**
 * Chance a player is available `offset` gameweeks after the next one. FPL's flag is for the next
 * gameweek; after that a doubtful or injured player is assumed to recover over about 3 gameweeks.
 * Players who left the club or aren't registered ("u", "n") stay unavailable.
 */
export function availabilityFor(status: string, chanceNextRound: number | null, offset: number): number {
  if (status === 'u' || status === 'n') return 0;
  const next = chanceNextRound !== null ? chanceNextRound / 100 : status === 'a' ? 1 : status === 'd' ? 0.5 : 0;
  return next + (1 - next) * Math.min(1, offset / 3);
}
