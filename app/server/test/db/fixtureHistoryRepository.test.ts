import assert from 'node:assert/strict';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../../src/db/database.js';
import {
  type FixtureHistoryRepository,
  createFixtureHistoryRepository,
} from '../../src/db/fixtureHistoryRepository.js';
import type { FixtureRecord } from '../../src/models/headToHead.js';

function record(overrides: Partial<FixtureRecord>): FixtureRecord {
  return {
    season: '2025-26',
    playerCode: 1,
    fixtureId: 1,
    kickoffTime: '2025-11-01T15:00:00Z',
    gameweek: 10,
    teamShortName: 'ARS',
    opponentCode: 14,
    opponentShortName: 'LIV',
    wasHome: true,
    teamHScore: 1,
    teamAScore: 0,
    minutes: 90,
    goals: 1,
    assists: 0,
    cleanSheets: 1,
    goalsConceded: 0,
    ownGoals: 0,
    penaltiesSaved: 0,
    penaltiesMissed: 0,
    yellowCards: 0,
    redCards: 0,
    saves: 0,
    bonus: 3,
    bps: 40,
    totalPoints: 12,
    expectedGoals: 0.6,
    expectedAssists: null,
    defensiveContribution: null,
    ...overrides,
  };
}

describe('fixtureHistoryRepository', () => {
  let db: DatabaseSync;
  let repo: FixtureHistoryRepository;

  beforeEach(() => {
    db = openDatabase(':memory:');
    repo = createFixtureHistoryRepository(db);
  });

  afterEach(() => db.close());

  it('round-trips a record and marks the season imported', () => {
    repo.saveSeason('2025-26', [record({})]);

    assert.deepEqual(repo.importedSeasons(), ['2025-26']);
    assert.deepEqual(repo.findPlayedAgainst(1, 14, 4), [record({})]);
  });

  it('replaces a season’s rows on re-import', () => {
    repo.saveSeason('2025-26', [record({ fixtureId: 1 }), record({ fixtureId: 2 })]);
    repo.saveSeason('2025-26', [record({ fixtureId: 3 })]);

    assert.deepEqual(repo.findPlayedAgainst(1, 14, 10).map((r) => r.fixtureId), [3]);
  });

  it('returns only matches the player featured in, newest first, up to the limit', () => {
    repo.saveSeason('2024-25', [
      record({ season: '2024-25', fixtureId: 10, kickoffTime: '2024-09-01T15:00:00Z' }),
      record({ season: '2024-25', fixtureId: 11, kickoffTime: '2025-02-01T15:00:00Z', minutes: 0 }),
    ]);
    repo.saveSeason('2025-26', [
      record({ fixtureId: 20, kickoffTime: '2025-10-01T15:00:00Z' }),
      record({ fixtureId: 21, kickoffTime: '2026-03-01T15:00:00Z' }),
      record({ fixtureId: 22, opponentCode: 3, opponentShortName: 'ARS' }),
      record({ fixtureId: 23, playerCode: 2 }),
    ]);

    assert.deepEqual(repo.findPlayedAgainst(1, 14, 10).map((r) => r.fixtureId), [21, 20, 10]);
    assert.deepEqual(repo.findPlayedAgainst(1, 14, 2).map((r) => r.fixtureId), [21, 20]);
  });
});
