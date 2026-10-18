import assert from 'node:assert/strict';
import type { PlayerHeadToHead, ScoutOptionsResponse } from '../src/models/headToHead.js';
import { fplCalls, historyCalls, mockFplApi, resetCalls } from './helpers/mockFplApi.js';
import { type ApiClient, loginAsAdmin, useTestEnvironment } from './helpers/namespace.js';

const byName = (players: PlayerHeadToHead[], name: string) => players.find((p) => p.player.webName === name)!;

// The mock season starts in August 2026; 2022-23 is missing from test/mocks/history.
const SEASONS_COVERED = ['2026-27', '2025-26', '2024-25', '2023-24'];

describe('head-to-head', () => {
  useTestEnvironment();
  let admin: ApiClient;

  beforeEach(async () => {
    admin = await loginAsAdmin();
  });

  describe('GET /api/head-to-head', () => {
    it('covers every squad player across the current season and every past season the source has', async () => {
      const { status, body } = await admin.headToHead();

      assert.equal(status, 200);
      assert.deepEqual(body.seasonsCovered, SEASONS_COVERED);
      assert.equal(body.gameweek, 2);
      assert.equal(body.players.length, 15);
    });

    it('returns the last 4 matches each player played against their next opponent, newest first', async () => {
      const salah = byName((await admin.headToHead()).body.players, 'M.Salah');

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

    it('includes result, venue and insights for each match, without internal codes', async () => {
      const [latest, , , oldest] = byName((await admin.headToHead()).body.players, 'M.Salah').matches;

      assert.equal(latest!.wasHome, true);
      assert.equal(latest!.result, 'W');
      assert.deepEqual(
        latest!.insights.map((i) => i.label),
        ['Goal', 'Assist', '+2 bonus'],
      );
      assert.ok(!('playerCode' in latest!) && !('opponentCode' in latest!));

      assert.equal(oldest!.wasHome, false);
      assert.equal(oldest!.result, 'D');
      assert.deepEqual(oldest!.insights, [
        { label: 'Assist', tone: 'good' },
        { label: 'Yellow card', tone: 'bad' },
      ]);
    });

    it('summarises the record against the opponent', async () => {
      const salah = byName((await admin.headToHead()).body.players, 'M.Salah');

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
      const raya = byName((await admin.headToHead()).body.players, 'Raya');

      assert.equal(raya.nextFixture?.opponent, 'LIV');
      assert.deepEqual(
        raya.matches.map((m) => `${m.season} ${m.teamShortName} ${m.result}`),
        ['2025-26 ARS L', '2024-25 ARS D', '2023-24 BRE L'],
      );
      assert.equal(raya.summary.verdict, 'poor');
    });

    it('returns an empty record for players who have never faced the opponent', async () => {
      const haaland = byName((await admin.headToHead()).body.players, 'Haaland');

      assert.equal(haaland.nextFixture?.opponent, 'CHE');
      assert.deepEqual(haaland.matches, []);
      assert.equal(haaland.summary.verdict, 'none');
    });

    it('serves repeat requests from the SQLite cache without calling either source', async () => {
      await admin.headToHead();
      resetCalls();

      const again = await admin.headToHead();

      assert.equal(again.body.cache.fromCache, true);
      assert.deepEqual(fplCalls, []);
      assert.deepEqual(historyCalls, []);
    });

    it('re-reads live data but downloads only missing past seasons on ?refresh=true', async () => {
      await admin.headToHead();
      mockFplApi();

      const refreshed = await admin.headToHead({ refresh: true });

      assert.equal(refreshed.body.cache.fromCache, false);
      assert.ok(fplCalls.includes('/element-summary/9/'));
      assert.ok(historyCalls.length > 0);
      assert.ok(
        historyCalls.every((path) => path.startsWith('2022-23/')),
        'only the missing season is retried',
      );
    });
  });

  describe('GET /api/head-to-head/options', () => {
    it('lists clubs by name with their players ordered by position, then name', async () => {
      const res = await admin.scoutOptions();
      const body: ScoutOptionsResponse = res.body;

      assert.equal(res.status, 200);
      assert.deepEqual(
        body.clubs.map((c) => c.shortName),
        ['ARS', 'CHE', 'LIV', 'MCI'],
      );
      const liverpool = body.clubs.find((c) => c.shortName === 'LIV')!;
      assert.deepEqual(
        liverpool.players.map((p) => `${p.position} ${p.webName}`),
        ['GK Alisson', 'DEF Virgil', 'MID M.Salah', 'FWD Isak'],
      );
      assert.equal(liverpool.players.find((p) => p.id === 9)?.fullName, 'Mohamed Salah');
    });
  });

  describe('GET /api/head-to-head/players/:id', () => {
    it('gives the same analysis for a single player as the squad view', async () => {
      const single = (await admin.scoutPlayer(9)).body;
      const squad: PlayerHeadToHead[] = (await admin.headToHead()).body.players;
      const fromSquad = squad.find((p) => p.player.id === 9)!;

      assert.equal(single.player.webName, 'M.Salah');
      assert.deepEqual(single.matches, fromSquad.matches);
      assert.deepEqual(single.summary, fromSquad.summary);
      assert.deepEqual(single.nextFixture, fromSquad.nextFixture);
      assert.deepEqual(single.seasonsCovered, SEASONS_COVERED);
    });

    it('works for players outside the squad, without loading the manager team', async () => {
      const isak = (await admin.scoutPlayer(16)).body; // sold after GW1

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
      assert.ok(!fplCalls.some((path) => path.startsWith('/entry/')));
    });

    it('caches each player separately for 30 minutes', async () => {
      await admin.scoutPlayer(9);
      resetCalls();

      assert.equal((await admin.scoutPlayer(9)).body.cache.fromCache, true);
      assert.deepEqual(fplCalls, []);
      assert.equal((await admin.scoutPlayer(16)).body.cache.fromCache, false);
    });

    it('validates the player id', async () => {
      assert.equal((await admin.scoutPlayer('abc')).status, 400);
      assert.equal((await admin.scoutPlayer(0)).status, 400);
      assert.equal((await admin.scoutPlayer(9999)).status, 404);
    });
  });
});
