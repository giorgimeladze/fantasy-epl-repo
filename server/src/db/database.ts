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
