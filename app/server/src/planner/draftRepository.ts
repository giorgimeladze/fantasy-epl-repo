// The manager's one draft plan (planned transfers), stored as JSON in SQLite.
import { getDatabase } from '../db/database.js';
import type { PlannedTransfer } from './models.js';

export const draftRepository = {
  get(teamId: number): { transfers: PlannedTransfer[]; updatedAt: number } | null {
    const row = getDatabase().prepare('SELECT transfers, updated_at FROM draft_plan WHERE team_id = ?').get(teamId) as
      { transfers: string; updated_at: number } | undefined;
    if (!row) return null;
    return { transfers: JSON.parse(row.transfers) as PlannedTransfer[], updatedAt: row.updated_at };
  },

  save(teamId: number, transfers: PlannedTransfer[]): number {
    const updatedAt = Date.now();
    getDatabase()
      .prepare(
        `INSERT INTO draft_plan (team_id, transfers, updated_at) VALUES (?, ?, ?)
         ON CONFLICT (team_id) DO UPDATE SET transfers = excluded.transfers, updated_at = excluded.updated_at`,
      )
      .run(teamId, JSON.stringify(transfers), updatedAt);
    return updatedAt;
  },

  clear(teamId: number): void {
    getDatabase().prepare('DELETE FROM draft_plan WHERE team_id = ?').run(teamId);
  },
};
