import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../../src/db/database.js';
import { type TeamCacheRepository, createTeamCacheRepository } from '../../src/db/teamCacheRepository.js';
import type { TeamSnapshot } from '../../src/models/team.js';

function snapshot(teamName: string): TeamSnapshot {
  return {
    manager: {
      teamId: 1,
      teamName,
      managerName: 'Test Manager',
      overallPoints: 0,
      overallRank: null,
      gameweekPoints: 0,
      bank: 0,
      teamValue: 100,
      activeChip: null,
      transfersCost: 0,
      pointsOnBench: 0,
    },
    gameweek: { id: 1, name: 'Gameweek 1', deadline: '2026-08-15T10:00:00Z', finished: false },
    players: [],
  };
}

describe('teamCacheRepository', () => {
  let db: DatabaseSync;
  let repo: TeamCacheRepository;

  beforeEach(() => {
    db = openDatabase(':memory:');
    repo = createTeamCacheRepository(db);
  });

  afterEach(() => db.close());

  it('runs migrations on open', () => {
    const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
    assert.equal(user_version, 1);
    const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'team_cache'").get();
    assert.ok(table);
  });

  it('returns null for a team that was never cached', () => {
    assert.equal(repo.get(1), null);
  });

  it('round-trips a snapshot with its fetch time', () => {
    repo.save(1, snapshot('First'), 1_000);
    assert.deepEqual(repo.get(1), { snapshot: snapshot('First'), fetchedAt: 1_000 });
  });

  it('overwrites the existing row for the same team', () => {
    repo.save(1, snapshot('Old'), 1_000);
    repo.save(1, snapshot('New'), 2_000);

    const cached = repo.get(1)!;
    assert.equal(cached.snapshot.manager.teamName, 'New');
    assert.equal(cached.fetchedAt, 2_000);
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM team_cache').get() as { count: number };
    assert.equal(count, 1);
  });

  it('keeps teams separate and deletes individually', () => {
    repo.save(1, snapshot('One'));
    repo.save(2, snapshot('Two'));
    repo.delete(1);

    assert.equal(repo.get(1), null);
    assert.equal(repo.get(2)?.snapshot.manager.teamName, 'Two');
  });
});
