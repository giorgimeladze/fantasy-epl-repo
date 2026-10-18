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
    position: null,
    starts: null,
    expectedPoints: null,
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
  it('stores position, starts and FPL\'s forecast', () => {
    const r = record({ position: 'MID', starts: 1, expectedPoints: 5.5 });
    repo.saveSeason('2025-26', [r]);
    assert.deepEqual(repo.seasonRecords('2025-26'), [r]);
  });

  it('returns a season in kickoff order', () => {
    repo.saveSeason('2025-26', [
      record({ fixtureId: 2, kickoffTime: '2025-12-01T15:00:00Z' }),
      record({ fixtureId: 1, kickoffTime: '2025-08-20T15:00:00Z' }),
    ]);
    repo.saveSeason('2024-25', [record({ season: '2024-25', fixtureId: 9 })]);

    assert.deepEqual(repo.seasonRecords('2025-26').map((r) => r.fixtureId), [1, 2]);
  });

  describe('playerSeasonTotals', () => {
    it('adds up the matches a player featured in', () => {
      repo.saveSeason('2025-26', [
        record({ fixtureId: 1, minutes: 90, starts: 1, expectedGoals: 0.5, expectedAssists: 0.2, bonus: 2, totalPoints: 9, defensiveContribution: 4 }),
        record({ fixtureId: 2, minutes: 30, starts: 0, expectedGoals: 0.1, expectedAssists: null, bonus: 0, totalPoints: 1, defensiveContribution: 1, yellowCards: 1 }),
        record({ fixtureId: 3, minutes: 0, starts: 0, expectedGoals: 0, bonus: 0, totalPoints: 0 }),
      ]);

      const totals = repo.playerSeasonTotals('2025-26').get(1)!;
      assert.equal(totals.appearances, 2);
      assert.equal(totals.minutes, 120);
      assert.equal(totals.starts, 1);
      assert.ok(Math.abs(totals.expectedGoals - 0.6) < 1e-9);
      assert.ok(Math.abs(totals.expectedAssists - 0.2) < 1e-9);
      assert.equal(totals.bonus, 2);
      assert.equal(totals.yellowCards, 1);
      assert.equal(totals.defensiveContribution, 5);
      assert.equal(totals.totalPoints, 10);
    });

    it('counts 60+ minute matches as starts when the season has no starts column', () => {
      repo.saveSeason('2023-24', [
        record({ season: '2023-24', fixtureId: 1, minutes: 90 }),
        record({ season: '2023-24', fixtureId: 2, minutes: 45 }),
      ]);
      const totals = repo.playerSeasonTotals('2023-24').get(1)!;
      assert.equal(totals.starts, 1);
      assert.equal(totals.defensiveContribution, null);
    });
  });

  describe('headToHeadAverages', () => {
    it('averages the last N meetings per opponent from earlier seasons only', () => {
      repo.saveSeason('2023-24', [
        record({ season: '2023-24', fixtureId: 1, kickoffTime: '2023-09-01T15:00:00Z', totalPoints: 15 }),
      ]);
      repo.saveSeason('2024-25', [
        record({ season: '2024-25', fixtureId: 2, kickoffTime: '2024-09-01T15:00:00Z', totalPoints: 2 }),
        record({ season: '2024-25', fixtureId: 3, kickoffTime: '2025-02-01T15:00:00Z', totalPoints: 6 }),
        record({ season: '2024-25', fixtureId: 4, kickoffTime: '2025-03-01T15:00:00Z', totalPoints: 0, minutes: 0 }),
        record({ season: '2024-25', fixtureId: 5, opponentCode: 3, totalPoints: 1 }),
      ]);
      repo.saveSeason('2025-26', [record({ fixtureId: 6, totalPoints: 20 })]);

      const { byOpponent, overall } = repo.headToHeadAverages('2025-26', 2);
      // Last 2 meetings with club 14 (the 0-minute one is ignored): 6 and 2.
      assert.deepEqual(byOpponent.get('1:14'), { meetings: 2, averagePoints: 4 });
      assert.deepEqual(byOpponent.get('1:3'), { meetings: 1, averagePoints: 1 });
      // Overall: 15, 2, 6, 1 (2025-26 is excluded).
      assert.equal(overall.get(1), 6);
    });
  });
});
