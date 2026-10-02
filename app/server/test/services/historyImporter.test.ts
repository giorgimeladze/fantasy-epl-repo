import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixtureHistoryRepository } from '../../src/db/fixtureHistoryRepository.js';
import type { FplBootstrap } from '../../src/models/fpl.js';
import {
  buildSeasonRecords,
  currentSeasonStartYear,
  historyImporter,
  previousSeasons,
  seasonLabel,
} from '../../src/services/historyImporter.js';
import { type FplApiMock, mockFplApi } from '../helpers/mockFplApi.js';

const historyMock = (path: string): string =>
  readFileSync(new URL(`../mocks/history/${path}`, import.meta.url), 'utf8');

function bootstrapWithFirstDeadline(deadline: string): FplBootstrap {
  return {
    events: [{ id: 1, name: 'Gameweek 1', deadline_time: deadline, finished: false, is_current: true, is_next: false }],
    teams: [],
    elements: [],
    element_types: [],
  };
}

describe('historyImporter', () => {
  describe('season helpers', () => {
    it('formats season labels', () => {
      assert.equal(seasonLabel(2025), '2025-26');
      assert.equal(seasonLabel(1999), '1999-00');
    });

    it('derives the current season from the first gameweek deadline', () => {
      assert.equal(currentSeasonStartYear(bootstrapWithFirstDeadline('2026-08-15T10:00:00Z')), 2026);
      assert.equal(currentSeasonStartYear(bootstrapWithFirstDeadline('2027-01-02T10:00:00Z')), 2026);
    });

    it('lists previous seasons newest first', () => {
      assert.deepEqual(previousSeasons(2026, 3), ['2025-26', '2024-25', '2023-24']);
    });
  });

  describe('buildSeasonRecords', () => {
    const records = buildSeasonRecords(
      '2025-26',
      historyMock('2025-26/gws/merged_gw.csv'),
      historyMock('2025-26/players_raw.csv'),
      historyMock('2025-26/teams.csv'),
    );

    it('maps season-specific IDs to stable player and team codes', () => {
      const salahVsArsenal = records.find((r) => r.fixtureId === 101 && r.playerCode === 100009);
      assert.deepEqual(salahVsArsenal, {
        season: '2025-26',
        playerCode: 100009,
        fixtureId: 101,
        kickoffTime: '2025-11-01T17:30:00Z',
        gameweek: 10,
        teamShortName: 'LIV',
        opponentCode: 3,
        opponentShortName: 'ARS',
        wasHome: true,
        teamHScore: 2,
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
        bps: 48,
        totalPoints: 11,
        expectedGoals: 0.8,
        expectedAssists: 0.1,
        defensiveContribution: 3,
      });
    });

    it('skips rows for players missing from players_raw', () => {
      assert.equal(records.length, 4);
    });

    it('leaves columns a season does not have as null', () => {
      const older = buildSeasonRecords(
        '2024-25',
        historyMock('2024-25/gws/merged_gw.csv'),
        historyMock('2024-25/players_raw.csv'),
        historyMock('2024-25/teams.csv'),
      );
      assert.ok(older.length > 0);
      assert.ok(older.every((r) => r.defensiveContribution === null));
    });
  });

  describe('ensureSeasons', () => {
    let fpl: FplApiMock;

    beforeEach(() => {
      fixtureHistoryRepository().clear();
      fpl = mockFplApi();
    });

    afterEach(() => fpl.restore());

    it('imports available seasons and skips ones the source does not have', async () => {
      const available = await historyImporter.ensureSeasons(['2025-26', '2024-25', '2023-24', '2022-23']);

      assert.deepEqual(available, ['2025-26', '2024-25', '2023-24']);
      assert.deepEqual(fixtureHistoryRepository().importedSeasons(), ['2025-26', '2024-25', '2023-24']);
      assert.equal(fixtureHistoryRepository().findPlayedAgainst(100009, 3, 10).length, 4);
    });

    it('downloads each season only once', async () => {
      await historyImporter.ensureSeasons(['2025-26']);
      fpl.historyCalls.length = 0;

      const available = await historyImporter.ensureSeasons(['2025-26']);

      assert.deepEqual(available, ['2025-26']);
      assert.deepEqual(fpl.historyCalls, []);
    });

    it('retries missing seasons on a later call', async () => {
      await historyImporter.ensureSeasons(['2022-23']);
      fpl.historyCalls.length = 0;

      await historyImporter.ensureSeasons(['2022-23']);

      assert.ok(fpl.historyCalls.some((path) => path.startsWith('2022-23/')));
    });
  });
});
