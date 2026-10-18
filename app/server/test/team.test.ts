import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import type { PlayerView } from '../src/team/models.js';
import { fplCalls, MOCK_TEAM_ID, mockFplApi, resetCalls } from './helpers/mockFplApi.js';
import { type ApiClient, loginAsAdmin, useTestEnvironment, withClockAhead, withTeamId } from './helpers/namespace.js';

describe('GET /api/team', () => {
  useTestEnvironment();
  let admin: ApiClient;

  beforeEach(async () => {
    admin = await loginAsAdmin();
  });

  describe('building the team from FPL data', () => {
    it('returns the manager summary and current gameweek', async () => {
      const { status, body } = await admin.team();

      assert.equal(status, 200);
      assert.deepEqual(body.manager, {
        teamId: MOCK_TEAM_ID,
        teamName: 'Mock Mid Table FC',
        managerName: 'Test Manager',
        overallPoints: 134,
        overallRank: 250000,
        gameweekPoints: 60,
        bank: 0.5,
        teamValue: 100.2,
        activeChip: null,
        transfersCost: 0,
        pointsOnBench: 3,
      });
      assert.equal(body.gameweek.id, 2);
      assert.equal(body.gameweek.finished, false);
    });

    it('lists all 15 players in pick order with XI, bench and armbands', async () => {
      const players: PlayerView[] = (await admin.team()).body.players;

      assert.deepEqual(
        players.map((p) => p.pickPosition),
        Array.from({ length: 15 }, (_, i) => i + 1),
      );
      assert.equal(players.filter((p) => p.isStarter).length, 11);
      assert.deepEqual(
        players.filter((p) => !p.isStarter).map((p) => p.webName),
        ['Alisson', 'Colwill', 'Rice', 'Havertz'],
      );
      assert.equal(players.find((p) => p.isCaptain)?.webName, 'Haaland');
      assert.equal(players.find((p) => p.isViceCaptain)?.webName, 'M.Salah');
      assert.ok(!players.some((p) => p.webName === 'Isak'), 'sold players are not listed');
    });

    it('maps player stats, positions, prices and availability', async () => {
      const players: PlayerView[] = (await admin.team()).body.players;
      const salah = players.find((p) => p.id === 9)!;
      const havertz = players.find((p) => p.id === 15)!;

      assert.equal(salah.fullName, 'Mohamed Salah');
      assert.equal(salah.position, 'MID');
      assert.deepEqual(salah.club, { id: 2, name: 'Liverpool', shortName: 'LIV' });
      assert.equal(salah.price, 14.5);
      assert.equal(salah.form, 8.5);
      assert.equal(salah.totalPoints, 17);
      assert.equal(salah.gameweekPoints, 5);
      assert.equal(salah.fplExpectedPoints, 6.8); // FPL's ep_next

      assert.equal(havertz.position, 'FWD');
      assert.equal(havertz.status, 'i');
      assert.equal(havertz.chanceOfPlayingNextRound, 0);
      assert.match(havertz.news, /Hamstring/);
    });

    it('computes points earned for the manager: captaincy, autosubs and transfers', async () => {
      const players: PlayerView[] = (await admin.team()).body.players;
      const pointsForMe = Object.fromEntries(players.map((p) => [p.webName, p.pointsForMe]));

      assert.deepEqual(pointsForMe, {
        Raya: 8,
        Saliba: 7,
        Gabriel: 9,
        Virgil: 8,
        Gvardiol: 2, // auto-subbed out in GW1
        Saka: 8,
        'M.Salah': 29, // 12×2 (GW1 captain) + 5
        Foden: 5,
        Palmer: 17,
        Haaland: 35, // 9 + 13×2 (GW2 captain)
        'N.Jackson': 2,
        Alisson: 0,
        Colwill: 2, // auto-subbed in for GW1 only
        Rice: 0,
        Havertz: 0, // always on the bench
      });
    });

    it('attaches upcoming fixtures with difficulty, skipping unscheduled ones', async () => {
      const players: PlayerView[] = (await admin.team()).body.players;
      const raya = players.find((p) => p.webName === 'Raya')!;
      const haaland = players.find((p) => p.webName === 'Haaland')!;

      assert.deepEqual(
        raya.nextFixtures.map(({ gameweek, opponent, isHome, difficulty }) => ({ gameweek, opponent, isHome, difficulty })),
        [
          { gameweek: 3, opponent: 'LIV', isHome: true, difficulty: 4 },
          { gameweek: 4, opponent: 'CHE', isHome: false, difficulty: 3 },
          { gameweek: 5, opponent: 'CHE', isHome: true, difficulty: 3 }, // double gameweek
          { gameweek: 5, opponent: 'LIV', isHome: false, difficulty: 4 },
        ],
      );
      assert.deepEqual(
        haaland.nextFixtures.map((f) => `${f.opponent}${f.isHome ? 'H' : 'A'}${f.difficulty}`),
        ['CHEH3', 'LIVA5'],
      );
    });
  });

  describe('SQLite cache', () => {
    it('fetches from FPL first, then serves repeat requests from the cache', async () => {
      const first = await admin.team();
      assert.equal(first.body.cache.fromCache, false);
      assert.ok(fplCalls.length > 0);
      assert.equal(
        Date.parse(first.body.cache.expiresAt) - Date.parse(first.body.cache.fetchedAt),
        config.db.cacheTtlMs,
      );

      resetCalls();
      const second = await admin.team();

      assert.equal(second.body.cache.fromCache, true);
      assert.equal(second.body.cache.fetchedAt, first.body.cache.fetchedAt);
      assert.deepEqual(fplCalls, []);
      assert.deepEqual(second.body.players, first.body.players);
    });

    it('refetches once the cached team is older than 30 minutes', async () => {
      await admin.team();
      resetCalls();

      const later = await withClockAhead(config.db.cacheTtlMs + 1000, () => admin.team());

      assert.equal(later.body.cache.fromCache, false);
      assert.ok(fplCalls.includes(`/entry/${MOCK_TEAM_ID}/`));
    });

    it('?refresh=true bypasses the cache', async () => {
      await admin.team();
      mockFplApi();

      const res = await admin.team({ refresh: true });

      assert.equal(res.status, 200);
      assert.equal(res.body.cache.fromCache, false);
      assert.ok(fplCalls.length > 0);
    });

    it('does not cache failed fetches', async () => {
      mockFplApi({ '/bootstrap-static/': { status: 503 } });
      assert.equal((await admin.team()).status, 503);

      mockFplApi();
      assert.equal((await admin.team()).body.cache.fromCache, false);
    });
  });

  describe('errors', () => {
    it('returns 500 when no team ID is configured', async () => {
      const res = await withTeamId(0, () => admin.team());
      assert.equal(res.status, 500);
      assert.match(res.body.error!, /FPL_TEAM_ID/);
    });

    it('returns 404 for an unknown FPL team', async () => {
      const res = await withTeamId(999, () => admin.team());
      assert.equal(res.status, 404);
    });

    it('passes FPL outages through as 503 JSON errors', async () => {
      mockFplApi({ [`/entry/${MOCK_TEAM_ID}/`]: { status: 503 } });

      const res = await admin.team();

      assert.equal(res.status, 503);
      assert.match(res.body.error!, /updating/);
    });

    it('returns 404 when the team has no picks yet', async () => {
      mockFplApi({
        [`/entry/${MOCK_TEAM_ID}/`]: { status: 200, body: { id: MOCK_TEAM_ID, current_event: null, started_event: 1 } },
      });

      const res = await admin.team();

      assert.equal(res.status, 404);
      assert.match(res.body.error!, /no picks yet/);
    });
  });
});
