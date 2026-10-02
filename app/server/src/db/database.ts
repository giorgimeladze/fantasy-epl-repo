import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from '../config.js';

// Append-only: each entry upgrades the schema by one version (tracked in PRAGMA user_version).
const MIGRATIONS: string[] = [
  `CREATE TABLE team_cache (
     team_id    INTEGER PRIMARY KEY,
     payload    TEXT    NOT NULL,
     fetched_at INTEGER NOT NULL
   )`,
  `CREATE TABLE response_cache (
     cache_key  TEXT    PRIMARY KEY,
     payload    TEXT    NOT NULL,
     fetched_at INTEGER NOT NULL
   );
   CREATE TABLE history_import (
     season      TEXT    PRIMARY KEY,
     imported_at INTEGER NOT NULL,
     row_count   INTEGER NOT NULL
   );
   CREATE TABLE player_fixture_history (
     season                  TEXT    NOT NULL,
     player_code             INTEGER NOT NULL,
     fixture_id              INTEGER NOT NULL,
     kickoff_time            TEXT,
     gameweek                INTEGER,
     team_short_name         TEXT,
     opponent_code           INTEGER NOT NULL,
     opponent_short_name     TEXT    NOT NULL,
     was_home                INTEGER NOT NULL,
     team_h_score            INTEGER,
     team_a_score            INTEGER,
     minutes                 INTEGER NOT NULL,
     goals_scored            INTEGER NOT NULL,
     assists                 INTEGER NOT NULL,
     clean_sheets            INTEGER NOT NULL,
     goals_conceded          INTEGER NOT NULL,
     own_goals               INTEGER NOT NULL,
     penalties_saved         INTEGER NOT NULL,
     penalties_missed        INTEGER NOT NULL,
     yellow_cards            INTEGER NOT NULL,
     red_cards               INTEGER NOT NULL,
     saves                   INTEGER NOT NULL,
     bonus                   INTEGER NOT NULL,
     bps                     INTEGER NOT NULL,
     total_points            INTEGER NOT NULL,
     expected_goals          REAL,
     expected_assists        REAL,
     defensive_contribution  INTEGER,
     PRIMARY KEY (season, player_code, fixture_id)
   );
   CREATE INDEX idx_history_player_opponent
     ON player_fixture_history (player_code, opponent_code, kickoff_time)`,
];

function migrate(db: DatabaseSync): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let version = current; version < MIGRATIONS.length; version++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]!);
      db.exec(`PRAGMA user_version = ${version + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

export function openDatabase(filePath: string): DatabaseSync {
  if (filePath !== ':memory:') mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL');
  migrate(db);
  return db;
}

let instance: DatabaseSync | null = null;

/** Shared connection, opened lazily from config.db.path. */
export function getDatabase(): DatabaseSync {
  instance ??= openDatabase(config.db.path);
  return instance;
}

export function closeDatabase(): void {
  instance?.close();
  instance = null;
}
