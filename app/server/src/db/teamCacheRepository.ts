import type { DatabaseSync } from 'node:sqlite';
import type { TeamSnapshot } from '../models/team.js';
import { getDatabase } from './database.js';

export interface CachedTeam {
  snapshot: TeamSnapshot;
  fetchedAt: number; // epoch ms
}

interface TeamCacheRow {
  payload: string;
  fetched_at: number;
}

export function createTeamCacheRepository(db: DatabaseSync) {
  return {
    get(teamId: number): CachedTeam | null {
      const row = db
        .prepare('SELECT payload, fetched_at FROM team_cache WHERE team_id = ?')
        .get(teamId) as TeamCacheRow | undefined;
      if (!row) return null;
      return { snapshot: JSON.parse(row.payload) as TeamSnapshot, fetchedAt: row.fetched_at };
    },

    save(teamId: number, snapshot: TeamSnapshot, fetchedAt: number = Date.now()): void {
      db.prepare(
        `INSERT INTO team_cache (team_id, payload, fetched_at) VALUES (?, ?, ?)
         ON CONFLICT (team_id) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`,
      ).run(teamId, JSON.stringify(snapshot), fetchedAt);
    },

    delete(teamId: number): void {
      db.prepare('DELETE FROM team_cache WHERE team_id = ?').run(teamId);
    },

    clear(): void {
      db.exec('DELETE FROM team_cache');
    },
  };
}

export type TeamCacheRepository = ReturnType<typeof createTeamCacheRepository>;

let instance: TeamCacheRepository | null = null;

export function teamCacheRepository(): TeamCacheRepository {
  instance ??= createTeamCacheRepository(getDatabase());
  return instance;
}
