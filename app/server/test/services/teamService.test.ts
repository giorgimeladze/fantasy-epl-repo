import assert from 'node:assert/strict';
import { config } from '../../src/config.js';
import { teamCacheRepository } from '../../src/db/teamCacheRepository.js';
import { teamService } from '../../src/services/teamService.js';
import { HttpError } from '../../src/utils/httpError.js';
import { type FplApiMock, MOCK_TEAM_ID, mockFplApi } from '../helpers/mockFplApi.js';

describe('teamService.getMyTeam', () => {
  let fpl: FplApiMock;

  beforeEach(() => {
    teamCacheRepository().clear();
    fpl = mockFplApi();
  });

  afterEach(() => fpl.restore());

  describe('building the team from FPL data', () => {
    it('returns the manager summary and current gameweek', async () => {
      const team = await teamService.getMyTeam(MOCK_TEAM_ID);

      assert.deepEqual(team.manager, {
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
      assert.equal(team.gameweek.id, 2);
      assert.equal(team.gameweek.finished, false);
    });

    it('lists all 15 players in pick order with XI, bench and armbands', async () => {
      const { players } = await teamService.getMyTeam(MOCK_TEAM_ID);

      assert.equal(players.length, 15);
      assert.deepEqual(players.map((p) => p.pickPosition), Array.from({ length: 15 }, (_, i) => i + 1));
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
      const { players } = await teamService.getMyTeam(MOCK_TEAM_ID);
      const salah = players.find((p) => p.id === 9)!;
      const havertz = players.find((p) => p.id === 15)!;

      assert.equal(salah.fullName, 'Mohamed Salah');
      assert.equal(salah.position, 'MID');
      assert.deepEqual(salah.club, { id: 2, name: 'Liverpool', shortName: 'LIV' });
      assert.equal(salah.price, 14.5);
      assert.equal(salah.form, 8.5);
      assert.equal(salah.totalPoints, 17);
      assert.equal(salah.gameweekPoints, 5);

      assert.equal(havertz.position, 'FWD');
      assert.equal(havertz.status, 'i');
      assert.equal(havertz.chanceOfPlayingNextRound, 0);
      assert.match(havertz.news, /Hamstring/);
    });

    it('computes points earned for the manager across gameweeks', async () => {
      const { players } = await teamService.getMyTeam(MOCK_TEAM_ID);
      const pointsForMe = Object.fromEntries(players.map((p) => [p.webName, p.pointsForMe]));

      assert.deepEqual(pointsForMe, {
        Raya: 8,
        Saliba: 7,
        Gabriel: 9,
        Virgil: 8,
        Gvardiol: 2,
        Saka: 8,
        'M.Salah': 29,
        Foden: 5,
        Palmer: 17,
        Haaland: 35,
        'N.Jackson': 2,
        Alisson: 0,
        Colwill: 2,
        Rice: 0,
        Havertz: 0,
      });
    });

    it('attaches upcoming fixtures with difficulty, skipping unscheduled ones', async () => {
      const { players } = await teamService.getMyTeam(MOCK_TEAM_ID);
      const raya = players.find((p) => p.webName === 'Raya')!;
      const haaland = players.find((p) => p.webName === 'Haaland')!;

      assert.deepEqual(
        raya.nextFixtures.map(({ gameweek, opponent, isHome, difficulty }) => ({ gameweek, opponent, isHome, difficulty })),
        [
          { gameweek: 3, opponent: 'LIV', isHome: true, difficulty: 4 },
          { gameweek: 4, opponent: 'CHE', isHome: false, difficulty: 3 },
        ],
      );
      assert.deepEqual(
        haaland.nextFixtures.map((f) => `${f.opponent}${f.isHome ? 'H' : 'A'}${f.difficulty}`),
        ['CHEH3', 'LIVA5'],
      );
    });
  });

  describe('SQLite team cache', () => {
    it('fetches from FPL on the first request and stores the result', async () => {
      const team = await teamService.getMyTeam(MOCK_TEAM_ID);

      assert.equal(team.cache.fromCache, false);
      assert.ok(fpl.calls.length > 0);
      assert.ok(teamCacheRepository().get(MOCK_TEAM_ID), 'snapshot saved to the database');
      assert.equal(
        Date.parse(team.cache.expiresAt) - Date.parse(team.cache.fetchedAt),
        config.db.teamCacheTtlMs,
      );
    });

    it('serves repeat requests within 30 minutes from the database without calling FPL', async () => {
      const first = await teamService.getMyTeam(MOCK_TEAM_ID);
      fpl.calls.length = 0;

      const second = await teamService.getMyTeam(MOCK_TEAM_ID);

      assert.equal(second.cache.fromCache, true);
      assert.equal(second.cache.fetchedAt, first.cache.fetchedAt);
      assert.deepEqual(fpl.calls, []);
      assert.deepEqual(second.players, first.players);
    });

    it('refetches once the cached team is older than 30 minutes', async () => {
      const first = await teamService.getMyTeam(MOCK_TEAM_ID);
      const stale = Date.now() - config.db.teamCacheTtlMs - 1000;
      teamCacheRepository().save(MOCK_TEAM_ID, teamCacheRepository().get(MOCK_TEAM_ID)!.snapshot, stale);
      fpl.restore();
      fpl = mockFplApi();

      const second = await teamService.getMyTeam(MOCK_TEAM_ID);

      assert.equal(second.cache.fromCache, false);
      assert.ok(fpl.calls.includes(`/entry/${MOCK_TEAM_ID}/`));
      assert.ok(Date.parse(second.cache.fetchedAt) >= Date.parse(first.cache.fetchedAt));
      assert.ok(teamCacheRepository().get(MOCK_TEAM_ID)!.fetchedAt > stale, 'cache row refreshed');
    });

    it('bypasses the cache when forceRefresh is set', async () => {
      await teamService.getMyTeam(MOCK_TEAM_ID);
      fpl.restore();
      fpl = mockFplApi();

      const team = await teamService.getMyTeam(MOCK_TEAM_ID, { forceRefresh: true });

      assert.equal(team.cache.fromCache, false);
      assert.ok(fpl.calls.length > 0);
    });

    it('does not cache failed fetches', async () => {
      fpl.restore();
      fpl = mockFplApi({ '/bootstrap-static/': { status: 503 } });

      await assert.rejects(teamService.getMyTeam(MOCK_TEAM_ID));
      assert.equal(teamCacheRepository().get(MOCK_TEAM_ID), null);
    });
  });

  describe('errors', () => {
    it('rejects when no team ID is configured', async () => {
      await assert.rejects(teamService.getMyTeam(0), (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 500);
        assert.match(err.message, /FPL_TEAM_ID/);
        return true;
      });
    });

    it('returns 404 for an unknown FPL team', async () => {
      await assert.rejects(teamService.getMyTeam(999), (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 404);
        return true;
      });
    });

    it('returns 503 while FPL is updating', async () => {
      fpl.restore();
      fpl = mockFplApi({ [`/entry/${MOCK_TEAM_ID}/`]: { status: 503 } });

      await assert.rejects(teamService.getMyTeam(MOCK_TEAM_ID), (err: unknown) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 503);
        return true;
      });
    });

    it('returns 404 when the team has no picks yet', async () => {
      fpl.restore();
      fpl = mockFplApi({
        [`/entry/${MOCK_TEAM_ID}/`]: { status: 200, body: { id: MOCK_TEAM_ID, current_event: null, started_event: 1 } },
      });

      await assert.rejects(teamService.getMyTeam(MOCK_TEAM_ID), /no picks yet/);
    });
  });
});
