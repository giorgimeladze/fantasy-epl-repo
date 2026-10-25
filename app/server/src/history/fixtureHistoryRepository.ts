import type { DatabaseSync } from 'node:sqlite';
import type { FixtureRecord } from '../headToHead/models.js';
import type { Position } from '../team/models.js';
import { getDatabase } from '../db/database.js';

interface FixtureRow {
  season: string;
  player_code: number;
  fixture_id: number;
  kickoff_time: string | null;
  gameweek: number | null;
  team_short_name: string | null;
  opponent_code: number;
  opponent_short_name: string;
  was_home: number;
  team_h_score: number | null;
  team_a_score: number | null;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  total_points: number;
  expected_goals: number | null;
  expected_assists: number | null;
  defensive_contribution: number | null;
  position: string | null;
  starts: number | null;
  expected_points: number | null;
}

/** One player's totals over a season (matches with minutes > 0). */
export interface PlayerSeasonTotals {
  appearances: number;
  minutes: number;
  starts: number;
  expectedGoals: number;
  expectedAssists: number;
  bonus: number;
  saves: number;
  yellowCards: number;
  redCards: number;
  defensiveContribution: number | null; // null before 2025-26
  totalPoints: number;
}

/** A player's average points against one club over their most recent meetings. */
export interface OpponentRecord {
  meetings: number;
  averagePoints: number;
}

export interface HeadToHeadAverages {
  /** Key `${playerCode}:${opponentCode}`. */
  byOpponent: Map<string, OpponentRecord>;
  /** Average points per appearance over the same seasons, by player code. */
  overall: Map<number, number>;
}

const COLUMNS = [
  'season', 'player_code', 'fixture_id', 'kickoff_time', 'gameweek', 'team_short_name',
  'opponent_code', 'opponent_short_name', 'was_home', 'team_h_score', 'team_a_score',
  'minutes', 'goals_scored', 'assists', 'clean_sheets', 'goals_conceded', 'own_goals',
  'penalties_saved', 'penalties_missed', 'yellow_cards', 'red_cards', 'saves', 'bonus',
  'bps', 'total_points', 'expected_goals', 'expected_assists', 'defensive_contribution',
  'position', 'starts', 'expected_points',
] as const;

function toValues(r: FixtureRecord): (string | number | null)[] {
  return [
    r.season, r.playerCode, r.fixtureId, r.kickoffTime, r.gameweek, r.teamShortName,
    r.opponentCode, r.opponentShortName, r.wasHome ? 1 : 0, r.teamHScore, r.teamAScore,
    r.minutes, r.goals, r.assists, r.cleanSheets, r.goalsConceded, r.ownGoals,
    r.penaltiesSaved, r.penaltiesMissed, r.yellowCards, r.redCards, r.saves, r.bonus,
    r.bps, r.totalPoints, r.expectedGoals, r.expectedAssists, r.defensiveContribution,
    r.position, r.starts, r.expectedPoints,
  ];
}

function fromRow(row: FixtureRow): FixtureRecord {
  return {
    season: row.season,
    playerCode: row.player_code,
    fixtureId: row.fixture_id,
    kickoffTime: row.kickoff_time,
    gameweek: row.gameweek,
    teamShortName: row.team_short_name,
    opponentCode: row.opponent_code,
    opponentShortName: row.opponent_short_name,
    wasHome: row.was_home === 1,
    teamHScore: row.team_h_score,
    teamAScore: row.team_a_score,
    minutes: row.minutes,
    goals: row.goals_scored,
    assists: row.assists,
    cleanSheets: row.clean_sheets,
    goalsConceded: row.goals_conceded,
    ownGoals: row.own_goals,
    penaltiesSaved: row.penalties_saved,
    penaltiesMissed: row.penalties_missed,
    yellowCards: row.yellow_cards,
    redCards: row.red_cards,
    saves: row.saves,
    bonus: row.bonus,
    bps: row.bps,
    totalPoints: row.total_points,
    expectedGoals: row.expected_goals,
    expectedAssists: row.expected_assists,
    defensiveContribution: row.defensive_contribution,
    position: row.position as Position | null,
    starts: row.starts,
    expectedPoints: row.expected_points,
  };
}

function createFixtureHistoryRepository(db: DatabaseSync) {
  return {
    importedSeasons(): string[] {
      const rows = db.prepare('SELECT season FROM history_import ORDER BY season DESC').all() as { season: string }[];
      return rows.map((r) => r.season);
    },

    /** Replaces a season's rows atomically and marks it imported. */
    saveSeason(season: string, records: readonly FixtureRecord[], importedAt: number = Date.now()): void {
      const insert = db.prepare(
        `INSERT OR REPLACE INTO player_fixture_history (${COLUMNS.join(', ')})
         VALUES (${COLUMNS.map(() => '?').join(', ')})`,
      );
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM player_fixture_history WHERE season = ?').run(season);
        for (const record of records) insert.run(...toValues(record));
        db.prepare(
          `INSERT INTO history_import (season, imported_at, row_count) VALUES (?, ?, ?)
           ON CONFLICT (season) DO UPDATE SET imported_at = excluded.imported_at, row_count = excluded.row_count`,
        ).run(season, importedAt, records.length);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    /** Fixtures where the player featured against the opponent, most recent first. */
    findPlayedAgainst(playerCode: number, opponentCode: number, limit: number): FixtureRecord[] {
      const rows = db
        .prepare(
          `SELECT * FROM player_fixture_history
           WHERE player_code = ? AND opponent_code = ? AND minutes > 0
           ORDER BY kickoff_time DESC
           LIMIT ?`,
        )
        .all(playerCode, opponentCode, limit) as unknown as FixtureRow[];
      return rows.map(fromRow);
    },

    /** Every row of one season, in kickoff order (used by the backtest). */
    seasonRecords(season: string): FixtureRecord[] {
      const rows = db
        .prepare('SELECT * FROM player_fixture_history WHERE season = ? ORDER BY kickoff_time, fixture_id, player_code')
        .all(season) as unknown as FixtureRow[];
      return rows.map(fromRow);
    },

    /** Per-player totals for one season, by player code. Starts default to 60+ minute matches if missing. */
    playerSeasonTotals(season: string): Map<number, PlayerSeasonTotals> {
      const rows = db
        .prepare(
          `SELECT player_code,
                  COUNT(*) AS appearances,
                  SUM(minutes) AS minutes,
                  SUM(COALESCE(starts, minutes >= 60)) AS starts,
                  SUM(COALESCE(expected_goals, 0)) AS xg,
                  SUM(COALESCE(expected_assists, 0)) AS xa,
                  SUM(bonus) AS bonus,
                  SUM(saves) AS saves,
                  SUM(yellow_cards) AS yellow_cards,
                  SUM(red_cards) AS red_cards,
                  SUM(defensive_contribution) AS dc,
                  SUM(total_points) AS total_points
           FROM player_fixture_history
           WHERE season = ? AND minutes > 0
           GROUP BY player_code`,
        )
        .all(season) as Record<string, number | null>[];
      return new Map(
        rows.map((r) => [
          Number(r.player_code),
          {
            appearances: Number(r.appearances),
            minutes: Number(r.minutes),
            starts: Number(r.starts),
            expectedGoals: Number(r.xg),
            expectedAssists: Number(r.xa),
            bonus: Number(r.bonus),
            saves: Number(r.saves),
            yellowCards: Number(r.yellow_cards),
            redCards: Number(r.red_cards),
            defensiveContribution: r.dc === null ? null : Number(r.dc),
            totalPoints: Number(r.total_points),
          },
        ]),
      );
    },

    /**
     * Each player's average points over their last `limit` appearances against every club, and their
     * overall average, using seasons before `beforeSeason`.
     */
    headToHeadAverages(beforeSeason: string, limit: number): HeadToHeadAverages {
      const pairs = db
        .prepare(
          `SELECT player_code, opponent_code, COUNT(*) AS meetings, AVG(total_points) AS average
           FROM (
             SELECT player_code, opponent_code, total_points,
                    ROW_NUMBER() OVER (PARTITION BY player_code, opponent_code ORDER BY kickoff_time DESC) AS n
             FROM player_fixture_history
             WHERE season < ? AND minutes > 0
           )
           WHERE n <= ?
           GROUP BY player_code, opponent_code`,
        )
        .all(beforeSeason, limit) as { player_code: number; opponent_code: number; meetings: number; average: number }[];
      const overall = db
        .prepare(
          `SELECT player_code, AVG(total_points) AS average FROM player_fixture_history
           WHERE season < ? AND minutes > 0 GROUP BY player_code`,
        )
        .all(beforeSeason) as { player_code: number; average: number }[];

      return {
        byOpponent: new Map(
          pairs.map((r) => [`${r.player_code}:${r.opponent_code}`, { meetings: r.meetings, averagePoints: r.average }]),
        ),
        overall: new Map(overall.map((r) => [r.player_code, r.average])),
      };
    },
  };
}

type FixtureHistoryRepository = ReturnType<typeof createFixtureHistoryRepository>;

let instance: FixtureHistoryRepository | null = null;

export function fixtureHistoryRepository(): FixtureHistoryRepository {
  instance ??= createFixtureHistoryRepository(getDatabase());
  return instance;
}
