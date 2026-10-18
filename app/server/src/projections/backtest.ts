// Replays a past season through projectionModel, one gameweek at a time, using only what was known
// before each gameweek. Pure: the caller loads the records (see src/scripts/backtest.ts).
import type { HeadToHeadAverages } from '../history/fixtureHistoryRepository.js';
import type { FixtureRecord } from '../headToHead/models.js';
import type { Position } from '../team/models.js';
import {
  type ClubTotals,
  clubStrengths,
  HEAD_TO_HEAD_WEIGHT,
  headToHeadFactor,
  type PlayerSample,
  projectFixture,
  strengthOf,
} from './projectionModel.js';

export interface ErrorStats {
  meanAbsoluteError: number;
  rootMeanSquaredError: number;
  bias: number; // mean (predicted − actual); positive = predicts too high
}

export interface BacktestScores {
  samples: number;
  model: ErrorStats;
  /** Season points so far per club match: the "just use their average" baseline. */
  baseline: ErrorStats;
  /**
   * Model vs FPL's own forecast ("xP") on the gameweeks the dataset has it for (the vaastav data
   * has gaps, e.g. xP is 0 for every player from GW7 of 2025-26). Null if there are none.
   */
  versusFpl: { samples: number; model: ErrorStats; fpl: ErrorStats } | null;
}

export interface BacktestResult extends BacktestScores {
  season: string;
  fromGameweek: number;
  toGameweek: number;
  byPosition: Record<Position, BacktestScores>;
  /**
   * Only players who then played 60+ minutes in every fixture of the gameweek. FPL's xP is taken
   * close to the deadline and knows team news (it is ~0.2 for players who end up not playing),
   * which the dataset can't give the model, so this is the fairer comparison with FPL.
   */
  playedSixty: BacktestScores;
}

export interface BacktestOptions {
  /** First gameweek scored; earlier ones only build up data. */
  fromGameweek?: number;
  headToHeadWeight?: number;
  /** Players count as regulars if they played in one of their club's last this-many gameweeks. */
  activeWithinGameweeks?: number;
}

interface Sample {
  position: Position;
  predicted: number;
  actual: number;
  fpl: number | null;
  baseline: number;
  playedSixty: boolean;
}

interface PlayerState extends PlayerSample {
  points: number;
  lastPlayedGw: number;
}

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
const round2 = (value: number): number => Math.round(value * 100) / 100;

function emptySample(): PlayerState {
  return {
    minutes: 0,
    starts: 0,
    expectedGoals: 0,
    expectedAssists: 0,
    bonus: 0,
    saves: 0,
    yellowCards: 0,
    redCards: 0,
    defensiveContribution: null,
    points: 0,
    lastPlayedGw: -Infinity,
  };
}

function errorStats(samples: readonly Sample[], pick: (s: Sample) => number): ErrorStats {
  const n = samples.length || 1;
  let abs = 0;
  let sq = 0;
  let bias = 0;
  for (const s of samples) {
    const diff = pick(s) - s.actual;
    abs += Math.abs(diff);
    sq += diff * diff;
    bias += diff;
  }
  return {
    meanAbsoluteError: round2(abs / n),
    rootMeanSquaredError: round2(Math.sqrt(sq / n)),
    bias: round2(bias / n),
  };
}

function scores(samples: readonly Sample[]): BacktestScores {
  const withFpl = samples.filter((s) => s.fpl !== null);
  return {
    samples: samples.length,
    model: errorStats(samples, (s) => s.predicted),
    baseline: errorStats(samples, (s) => s.baseline),
    versusFpl: withFpl.length
      ? {
          samples: withFpl.length,
          model: errorStats(withFpl, (s) => s.predicted),
          fpl: errorStats(withFpl, (s) => s.fpl ?? 0),
        }
      : null,
  };
}

export function runBacktest(
  season: string,
  records: readonly FixtureRecord[],
  priorSeason: Map<number, PlayerSample>,
  headToHead: HeadToHeadAverages,
  { fromGameweek = 4, headToHeadWeight = HEAD_TO_HEAD_WEIGHT, activeWithinGameweeks = 3 }: BacktestOptions = {},
): BacktestResult {
  const byGameweek = new Map<number, FixtureRecord[]>();
  for (const r of records) {
    if (r.gameweek === null || r.teamShortName === null) continue;
    byGameweek.set(r.gameweek, [...(byGameweek.get(r.gameweek) ?? []), r]);
  }
  const gameweeks = [...byGameweek.keys()].sort((a, b) => a - b);

  const players = new Map<number, PlayerState>();
  const clubs = new Map<string, ClubTotals>();
  const clubLastGw = new Map<string, number[]>(); // gameweeks each club played, ascending
  const samples: Sample[] = [];

  for (const gw of gameweeks) {
    const rows = byGameweek.get(gw)!;

    // A gameweek where nobody has a forecast is a gap in the dataset, not a forecast of 0.
    const hasFpl = rows.some((r) => (r.expectedPoints ?? 0) !== 0);

    if (gw >= fromGameweek) {
      const league = clubStrengths(clubs);
      const rowsByPlayer = new Map<number, FixtureRecord[]>();
      for (const r of rows) rowsByPlayer.set(r.playerCode, [...(rowsByPlayer.get(r.playerCode) ?? []), r]);

      for (const [code, playerRows] of rowsByPlayer) {
        const first = playerRows[0]!;
        const state = players.get(code);
        const club = first.teamShortName!;
        const clubMatches = clubs.get(club)?.matches ?? 0;
        const recent = (clubLastGw.get(club) ?? []).slice(-activeWithinGameweeks)[0] ?? Infinity;
        if (!first.position || !state || clubMatches === 0 || state.lastPlayedGw < recent) continue;

        const player = { position: first.position, current: state, prior: priorSeason.get(code) ?? null, clubMatches };
        let predicted = 0;
        for (const r of playerRows) {
          const factor = headToHeadFactor(
            headToHead.byOpponent.get(`${code}:${r.opponentCode}`),
            headToHead.overall.get(code),
            headToHeadWeight,
          );
          predicted += projectFixture(
            player,
            {
              isHome: r.wasHome,
              club: strengthOf(league, club),
              opponent: strengthOf(league, r.opponentShortName),
              headToHeadFactor: factor,
            },
            league,
            1, // availability flags aren't in the dataset; only recent regulars are scored
          ).points;
        }

        const fplValues = playerRows.map((r) => r.expectedPoints);
        samples.push({
          position: first.position,
          predicted,
          actual: playerRows.reduce((sum, r) => sum + r.totalPoints, 0),
          fpl: hasFpl && fplValues.every((v) => v !== null) ? fplValues.reduce((sum, v) => sum + v!, 0) : null,
          baseline: (state.points / clubMatches) * playerRows.length,
          playedSixty: playerRows.every((r) => r.minutes >= 60),
        });
      }
    }

    // Add this gameweek's matches to what is known.
    const fixtureClubs = new Map<string, { club: string; opponent: string; xg: number }>();
    for (const r of rows) {
      const key = `${r.fixtureId}:${r.teamShortName}`;
      const entry = fixtureClubs.get(key) ?? { club: r.teamShortName!, opponent: r.opponentShortName, xg: 0 };
      entry.xg += r.expectedGoals ?? 0;
      fixtureClubs.set(key, entry);

      if (r.minutes > 0) {
        const s = players.get(r.playerCode) ?? emptySample();
        s.minutes += r.minutes;
        s.starts += r.starts ?? (r.minutes >= 60 ? 1 : 0);
        s.expectedGoals += r.expectedGoals ?? 0;
        s.expectedAssists += r.expectedAssists ?? 0;
        s.bonus += r.bonus;
        s.saves += r.saves;
        s.yellowCards += r.yellowCards;
        s.redCards += r.redCards;
        if (r.defensiveContribution !== null)
          s.defensiveContribution = (s.defensiveContribution ?? 0) + r.defensiveContribution;
        s.points += r.totalPoints;
        s.lastPlayedGw = gw;
        players.set(r.playerCode, s);
      }
    }
    for (const [key, side] of fixtureClubs) {
      const fixtureId = key.split(':')[0];
      const against = fixtureClubs.get(`${fixtureId}:${side.opponent}`)?.xg ?? 0;
      const totals = clubs.get(side.club) ?? { matches: 0, goalsFor: 0, goalsAgainst: 0 };
      totals.matches += 1;
      totals.goalsFor += side.xg;
      totals.goalsAgainst += against;
      clubs.set(side.club, totals);
      const played = clubLastGw.get(side.club) ?? [];
      if (played.at(-1) !== gw) played.push(gw);
      clubLastGw.set(side.club, played);
    }
  }

  const scored = gameweeks.filter((gw) => gw >= fromGameweek);
  return {
    season,
    fromGameweek: scored[0] ?? fromGameweek,
    toGameweek: scored.at(-1) ?? fromGameweek,
    ...scores(samples),
    byPosition: Object.fromEntries(
      POSITIONS.map((p) => [p, scores(samples.filter((s) => s.position === p))]),
    ) as Record<Position, BacktestScores>,
    playedSixty: scores(samples.filter((s) => s.playedSixty)),
  };
}
