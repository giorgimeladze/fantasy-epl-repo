import assert from 'node:assert/strict';
import { fixtureHistoryRepository } from '../../src/db/fixtureHistoryRepository.js';
import { responseCacheRepository } from '../../src/db/responseCacheRepository.js';
import { teamCacheRepository } from '../../src/db/teamCacheRepository.js';
import { headToHeadService } from '../../src/services/headToHeadService.js';
import { HttpError } from '../../src/utils/httpError.js';
import { type FplApiMock, MOCK_TEAM_ID, mockFplApi } from '../helpers/mockFplApi.js';

describe('headToHeadService.getHeadToHead', () => {
  let fpl: FplApiMock;

  beforeEach(() => {
    teamCacheRepository().clear();
    responseCacheRepository().clear();
    fixtureHistoryRepository().clear();
    fpl = mockFplApi();
  });

  afterEach(() => fpl.restore());

  it('covers the current season plus every past season the source has', async () => {
    const h2h = await headToHeadService.getHeadToHead(MOCK_TEAM_ID);

    // The mock season starts in August 2026; 2022-23 is missing from test/mocks/history.
    assert.deepEqual(h2h.seasonsCovered, ['2026-27', '2025-26', '2024-25', '2023-24']);
    assert.equal(h2h.gameweek, 2);
    assert.equal(h2h.players.length, 15);
  });

  it('returns the last 4 matches the player played against the next opponent, newest first', async () => {
    const { players } = await headToHeadService.getHeadToHead(MOCK_TEAM_ID);
    const salah = players.find((p) => p.player.webName === 'M.Salah')!;

    assert.equal(salah.nextFixture?.opponent, 'ARS');
    assert.deepEqual(
      salah.matches.map((m) => [m.season, m.kickoffTime?.slice(0, 10), m.opponentShortName, m.totalPoints]),
      [
        ['2026-27', '2026-08-16', 'ARS', 12], // this season, from the live FPL API
        ['2025-26', '2025-11-01', 'ARS', 11], // the 0-minute meeting in March 2026 is skipped
        ['2024-25', '2025-05-11', 'ARS', 8],
        ['2024-25', '2024-10-27', 'ARS', 4], // the 2023-24 meeting falls outside the last 4
      ],
    );
  });

  it('includes result, venue and insights for each match', async () => {
    const { players } = await headToHeadService.getHeadToHead(MOCK_TEAM_ID);
    const [latest, , , oldest] = players.find((p) => p.player.webName === 'M.Salah')!.matches;

    assert.equal(latest!.wasHome, true);
    assert.equal(latest!.result, 'W');
    assert.deepEqual(latest!.insights.map((i) => i.label), ['Goal', 'Assist', '+2 bonus']);

    assert.equal(oldest!.wasHome, false);
    assert.equal(oldest!.result, 'D');
    assert.deepEqual(oldest!.insights, [
      { label: 'Assist', tone: 'good' },
      { label: 'Yellow card', tone: 'bad' },
    ]);
  });

  it('summarises the record against the opponent', async () => {
    const { players } = await headToHeadService.getHeadToHead(MOCK_TEAM_ID);
    const salah = players.find((p) => p.player.webName === 'M.Salah')!;

    assert.deepEqual(salah.summary, {
      matches: 4,
      averagePoints: 8.8,
      totalPoints: 35,
      goals: 3,
      assists: 2,
      cleanSheets: 1,
      bonus: 6,
      cards: 1,
      verdict: 'good',
    });
  });

  it('shows the club a player was at when they met the opponent', async () => {
    const { players } = await headToHeadService.getHeadToHead(MOCK_TEAM_ID);
    const raya = players.find((p) => p.player.webName === 'Raya')!;

    assert.equal(raya.nextFixture?.opponent, 'LIV');
    assert.deepEqual(
      raya.matches.map((m) => `${m.season} ${m.teamShortName} ${m.result}`),
      ['2025-26 ARS L', '2024-25 ARS D', '2023-24 BRE L'],
    );
    assert.equal(raya.summary.verdict, 'poor');
  });

  it('returns an empty record for players who have never faced the opponent', async () => {
    const { players } = await headToHeadService.getHeadToHead(MOCK_TEAM_ID);
    const haaland = players.find((p) => p.player.webName === 'Haaland')!;

    assert.equal(haaland.nextFixture?.opponent, 'CHE');
    assert.deepEqual(haaland.matches, []);
    assert.equal(haaland.summary.verdict, 'none');
  });

  it('serves repeat requests from the SQLite cache without calling either source', async () => {
    await headToHeadService.getHeadToHead(MOCK_TEAM_ID);
    fpl.calls.length = 0;
    fpl.historyCalls.length = 0;

    const second = await headToHeadService.getHeadToHead(MOCK_TEAM_ID);

    assert.equal(second.cache.fromCache, true);
    assert.deepEqual(fpl.calls, []);
    assert.deepEqual(fpl.historyCalls, []);
  });

  it('re-reads live data but not past seasons on a forced refresh', async () => {
    await headToHeadService.getHeadToHead(MOCK_TEAM_ID);
    fpl.restore();
    fpl = mockFplApi();

    const refreshed = await headToHeadService.getHeadToHead(MOCK_TEAM_ID, { forceRefresh: true });

    assert.equal(refreshed.cache.fromCache, false);
    assert.ok(fpl.calls.includes('/element-summary/9/'));
    assert.ok(fpl.historyCalls.every((path) => path.startsWith('2022-23/')), 'only the missing season is retried');
  });
});

describe('headToHeadService.getPlayerHeadToHead (scout any player)', () => {
  let fpl: FplApiMock;

  beforeEach(() => {
    responseCacheRepository().clear();
    fixtureHistoryRepository().clear();
    fpl = mockFplApi();
  });

  afterEach(() => fpl.restore());

  it('gives the same analysis for a single player as the squad view', async () => {
    const [squad, single] = await Promise.all([
      headToHeadService.getHeadToHead(MOCK_TEAM_ID),
      headToHeadService.getPlayerHeadToHead(9),
    ]);
    const fromSquad = squad.players.find((p) => p.player.id === 9)!;

    assert.deepEqual(single.matches, fromSquad.matches);
    assert.deepEqual(single.summary, fromSquad.summary);
    assert.deepEqual(single.nextFixture, fromSquad.nextFixture);
    assert.deepEqual(single.seasonsCovered, ['2026-27', '2025-26', '2024-25', '2023-24']);
  });

  it('works for players outside the squad', async () => {
    const isak = await headToHeadService.getPlayerHeadToHead(16); // sold after GW1

    assert.deepEqual(isak.player, {
      id: 16,
      webName: 'Isak',
      position: 'FWD',
      clubShortName: 'LIV',
      pickPosition: null,
      isStarter: false,
    });
    assert.equal(isak.nextFixture?.opponent, 'ARS');
    assert.equal(isak.summary.verdict, 'none');
  });

  it('does not need the manager team (no FPL entry calls)', async () => {
    await headToHeadService.getPlayerHeadToHead(9);
    assert.ok(!fpl.calls.some((path) => path.startsWith('/entry/')));
  });

  it('caches each player separately for 30 minutes', async () => {
    await headToHeadService.getPlayerHeadToHead(9);
    fpl.calls.length = 0;

    assert.equal((await headToHeadService.getPlayerHeadToHead(9)).cache.fromCache, true);
    assert.deepEqual(fpl.calls, []);
    assert.equal((await headToHeadService.getPlayerHeadToHead(16)).cache.fromCache, false);
  });

  it('returns 404 for an unknown player', async () => {
    await assert.rejects(headToHeadService.getPlayerHeadToHead(9999), (err: unknown) => {
      assert.ok(err instanceof HttpError);
      assert.equal(err.status, 404);
      return true;
    });
  });
});

describe('headToHeadService.getScoutOptions', () => {
  let fpl: FplApiMock;

  beforeEach(() => {
    fpl = mockFplApi();
  });

  afterEach(() => fpl.restore());

  it('lists clubs by name with their players ordered by position, then name', async () => {
    const { clubs } = await headToHeadService.getScoutOptions();

    assert.deepEqual(clubs.map((c) => c.shortName), ['ARS', 'CHE', 'LIV', 'MCI']);
    const liverpool = clubs.find((c) => c.shortName === 'LIV')!;
    assert.deepEqual(
      liverpool.players.map((p) => `${p.position} ${p.webName}`),
      ['GK Alisson', 'DEF Virgil', 'MID M.Salah', 'FWD Isak'],
    );
    assert.equal(liverpool.players.find((p) => p.id === 9)?.fullName, 'Mohamed Salah');
  });
});
