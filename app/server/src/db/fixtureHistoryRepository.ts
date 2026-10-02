import type { DatabaseSync } from 'node:sqlite';
import type { FixtureRecord } from '../models/headToHead.js';
import { getDatabase } from './database.js';

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
}

const COLUMNS = [
  'season', 'player_code', 'fixture_id', 'kickoff_time', 'gameweek', 'team_short_name',
  'opponent_code', 'opponent_short_name', 'was_home', 'team_h_score', 'team_a_score',
  'minutes', 'goals_scored', 'assists', 'clean_sheets', 'goals_conceded', 'own_goals',
  'penalties_saved', 'penalties_missed', 'yellow_cards', 'red_cards', 'saves', 'bonus',
  'bps', 'total_points', 'expected_goals', 'expected_assists', 'defensive_contribution',
] as const;

function toValues(r: FixtureRecord): (string | number | null)[] {
  return [
    r.season, r.playerCode, r.fixtureId, r.kickoffTime, r.gameweek, r.teamShortName,
    r.opponentCode, r.opponentShortName, r.wasHome ? 1 : 0, r.teamHScore, r.teamAScore,
    r.minutes, r.goals, r.assists, r.cleanSheets, r.goalsConceded, r.ownGoals,
    r.penaltiesSaved, r.penaltiesMissed, r.yellowCards, r.redCards, r.saves, r.bonus,
    r.bps, r.totalPoints, r.expectedGoals, r.expectedAssists, r.defensiveContribution,
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
  };
}

export function createFixtureHistoryRepository(db: DatabaseSync) {
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

    clear(): void {
      db.exec('DELETE FROM player_fixture_history; DELETE FROM history_import;');
    },
  };
}

export type FixtureHistoryRepository = ReturnType<typeof createFixtureHistoryRepository>;

let instance: FixtureHistoryRepository | null = null;

export function fixtureHistoryRepository(): FixtureHistoryRepository {
  instance ??= createFixtureHistoryRepository(getDatabase());
  return instance;
}
