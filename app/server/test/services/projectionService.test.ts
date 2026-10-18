import assert from 'node:assert/strict';
import { fixtureHistoryRepository } from '../../src/db/fixtureHistoryRepository.js';
import { responseCacheRepository } from '../../src/db/responseCacheRepository.js';
import { teamCacheRepository } from '../../src/db/teamCacheRepository.js';
import type { FplBootstrap, FplFixture } from '../../src/models/fpl.js';
import type { PlayerProjection } from '../../src/models/projections.js';
import { clubTotalsThisSeason, projectionService, upcomingGameweeks } from '../../src/services/projectionService.js';
import { type FplApiMock, loadMock, MOCK_TEAM_ID, mockFplApi } from '../helpers/mockFplApi.js';

const byName = (players: PlayerProjection[], name: string) => players.find((p) => p.webName === name)!;

describe('projectionService', () => {
  describe('helpers', () => {
    const bootstrap = loadMock<FplBootstrap>('bootstrap-static.json');
    const fixtures = loadMock<FplFixture[]>('fixtures.json');

    it('projects from the next gameweek onwards', () => {
      assert.deepEqual(upcomingGameweeks(bootstrap, 5), [3, 4, 5]);
      assert.deepEqual(upcomingGameweeks(bootstrap, 2), [3, 4]);
      const seasonOver = { ...bootstrap, events: bootstrap.events.map((e) => ({ ...e, is_next: false })) };
      assert.deepEqual(upcomingGameweeks(seasonOver, 5), []);
    });

    it('totals each club’s finished matches, xG for, and goalkeepers’ xG against', () => {
      const totals = clubTotalsThisSeason(bootstrap, fixtures);
      const ars = totals.get('ARS')!;
      assert.equal(ars.matches, 2);
      // Gabriel 0.90 + Havertz 0.90; Raya's 1.80 xG conceded.
      assert.ok(Math.abs(ars.goalsFor - 1.8) < 1e-9);
      assert.ok(Math.abs(ars.goalsAgainst - 1.8) < 1e-9);
      assert.equal(totals.get('MCI')!.matches, 2);
    });
  });

  describe('getProjections', () => {
    let fpl: FplApiMock;

    beforeEach(() => {
      teamCacheRepository().clear();
      responseCacheRepository().clear();
      fixtureHistoryRepository().clear();
      fpl = mockFplApi();
    });

    afterEach(() => fpl.restore());

    it('projects the squad in pick order for the upcoming gameweeks', async () => {
      const result = await projectionService.getProjections(MOCK_TEAM_ID);

      assert.deepEqual(result.gameweeks, [3, 4, 5]);
      assert.equal(result.squad.length, 15);
      assert.deepEqual(
        result.squad.map((p) => p.pickPosition),
        Array.from({ length: 15 }, (_, i) => i + 1),
      );
      for (const p of result.squad) {
        assert.deepEqual(
          p.gameweeks.map((g) => g.gameweek),
          [3, 4, 5],
        );
        assert.equal(p.nextGameweekPoints, p.gameweeks[0]!.points);
        const sum = p.gameweeks.reduce((s, g) => s + g.points, 0);
        assert.ok(Math.abs(p.horizonPoints - sum) < 0.011, `${p.webName}: ${p.horizonPoints} vs ${sum}`);
      }
    });

    it('adds both fixtures in a double gameweek and nothing in a blank', async () => {
      const { squad } = await projectionService.getProjections(MOCK_TEAM_ID);
      const raya = byName(squad, 'Raya'); // Arsenal play twice in GW5
      const haaland = byName(squad, 'Haaland'); // Man City don't play in GW5

      const gw5 = raya.gameweeks[2]!;
      assert.deepEqual(
        gw5.fixtures.map((f) => `${f.opponent}${f.isHome ? 'H' : 'A'}`),
        ['CHEH', 'LIVA'],
      );
      assert.ok(Math.abs(gw5.points - (gw5.fixtures[0]!.points + gw5.fixtures[1]!.points)) < 0.011);
      assert.ok(gw5.points > raya.gameweeks[1]!.points);

      assert.deepEqual(haaland.gameweeks[2], { gameweek: 5, points: 0, fixtures: [] });
    });

    it('explains each fixture with a breakdown that adds up to its points', async () => {
      const { squad } = await projectionService.getProjections(MOCK_TEAM_ID);
      const fixture = byName(squad, 'M.Salah').gameweeks[0]!.fixtures[0]!;

      assert.equal(fixture.opponent, 'ARS');
      assert.equal(fixture.isHome, false);
      assert.equal(fixture.difficulty, 4);
      const sum = Object.values(fixture.breakdown).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - fixture.points) < 0.05);
      assert.ok(fixture.breakdown.goals > 0 && fixture.expectedMinutes > 0);
    });

    it('uses FPL’s injury flags and shows FPL’s own forecast', async () => {
      const { squad } = await projectionService.getProjections(MOCK_TEAM_ID);
      const havertz = byName(squad, 'Havertz'); // injured, 0 % chance next round
      const salah = byName(squad, 'M.Salah');

      assert.equal(havertz.nextGameweekPoints, 0);
      assert.equal(havertz.gameweeks[0]!.fixtures[0]!.expectedMinutes, 0);
      assert.ok(havertz.gameweeks[1]!.points > 0); // assumed to be recovering
      assert.equal(havertz.status, 'i');
      assert.equal(salah.fplExpectedPoints, 6.8);
    });

    it('adjusts for the record against the opponent from past seasons', async () => {
      const { squad } = await projectionService.getProjections(MOCK_TEAM_ID);
      // Salah's last 4 vs Arsenal average 6.25 against 5.4 overall → 1 + 0.15 × (6.25/5.4 − 1).
      const factor = byName(squad, 'M.Salah').gameweeks[0]!.fixtures[0]!.headToHeadFactor;
      assert.equal(factor, Math.round((1 + 0.15 * (6.25 / 5.4 - 1)) * 100) / 100);
      // Haaland has a single past match against nobody he plays next: neutral.
      assert.equal(byName(squad, 'Haaland').gameweeks[0]!.fixtures[0]!.headToHeadFactor, 1);
    });

    it('lists the top players per position across the league, marking squad players', async () => {
      const { top } = await projectionService.getProjections(MOCK_TEAM_ID);

      assert.deepEqual(Object.keys(top), ['GK', 'DEF', 'MID', 'FWD']);
      assert.equal(top.FWD.length, 4); // every forward in the mock league
      for (const list of Object.values(top)) {
        const points = list.map((p) => p.horizonPoints);
        assert.deepEqual(
          points,
          [...points].sort((a, b) => b - a),
        );
      }
      const isak = top.FWD.find((p) => p.webName === 'Isak')!;
      assert.equal(isak.pickPosition, null);
      assert.equal(top.FWD.find((p) => p.webName === 'Haaland')!.pickPosition, 10);
    });

    it('serves repeat requests from the SQLite cache, and refetches on refresh', async () => {
      const first = await projectionService.getProjections(MOCK_TEAM_ID);
      const callsAfterFirst = fpl.calls.length;
      const second = await projectionService.getProjections(MOCK_TEAM_ID);

      assert.equal(first.cache.fromCache, false);
      assert.equal(second.cache.fromCache, true);
      assert.equal(fpl.calls.length, callsAfterFirst);
      assert.deepEqual(second.squad, first.squad);

      const refreshed = await projectionService.getProjections(MOCK_TEAM_ID, { forceRefresh: true });
      assert.equal(refreshed.cache.fromCache, false); // FPL calls themselves may come from fplClient's 2-minute cache
    });
  });
});
