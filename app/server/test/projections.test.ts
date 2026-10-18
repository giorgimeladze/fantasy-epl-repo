import assert from 'node:assert/strict';
import type { PlayerProjection, ProjectionsResponse } from '../src/models/projections.js';
import { fplCalls } from './helpers/mockFplApi.js';
import { type ApiClient, loginAsAdmin, useTestEnvironment } from './helpers/namespace.js';

const byName = (players: PlayerProjection[], name: string) => players.find((p) => p.webName === name)!;

describe('GET /api/projections', () => {
  useTestEnvironment();
  let admin: ApiClient;

  beforeEach(async () => {
    admin = await loginAsAdmin();
  });

  it('projects the squad in pick order for the upcoming gameweeks', async () => {
    const res = await admin.projections();
    const body: ProjectionsResponse = res.body;

    assert.equal(res.status, 200);
    assert.deepEqual(body.gameweeks, [3, 4, 5]);
    assert.deepEqual(
      body.squad.map((p) => p.pickPosition),
      Array.from({ length: 15 }, (_, i) => i + 1),
    );
    for (const p of body.squad) {
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
    const squad: PlayerProjection[] = (await admin.projections()).body.squad;
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
    const fixture = byName((await admin.projections()).body.squad, 'M.Salah').gameweeks[0]!.fixtures[0]!;

    assert.equal(fixture.opponent, 'ARS');
    assert.equal(fixture.isHome, false);
    assert.equal(fixture.difficulty, 4);
    const sum = Object.values(fixture.breakdown).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - fixture.points) < 0.05);
    assert.ok(fixture.breakdown.goals > 0 && fixture.expectedMinutes > 0);
  });

  it('uses FPL’s injury flags and shows FPL’s own forecast', async () => {
    const squad: PlayerProjection[] = (await admin.projections()).body.squad;
    const havertz = byName(squad, 'Havertz'); // injured, 0 % chance next round

    assert.equal(havertz.status, 'i');
    assert.equal(havertz.nextGameweekPoints, 0);
    assert.equal(havertz.gameweeks[0]!.fixtures[0]!.expectedMinutes, 0);
    assert.ok(havertz.gameweeks[1]!.points > 0); // assumed to be recovering
    assert.equal(byName(squad, 'M.Salah').fplExpectedPoints, 6.8);
  });

  it('adjusts for the record against the opponent from past seasons', async () => {
    const squad: PlayerProjection[] = (await admin.projections()).body.squad;
    // Salah's last 4 vs Arsenal average 6.25 against 5.4 overall → 1 + 0.15 × (6.25/5.4 − 1).
    const factor = byName(squad, 'M.Salah').gameweeks[0]!.fixtures[0]!.headToHeadFactor;
    assert.equal(factor, Math.round((1 + 0.15 * (6.25 / 5.4 - 1)) * 100) / 100);
    // Haaland has a single past match against nobody he plays next: neutral.
    assert.equal(byName(squad, 'Haaland').gameweeks[0]!.fixtures[0]!.headToHeadFactor, 1);
  });

  it('lists the top players per position across the league, marking squad players', async () => {
    const top: ProjectionsResponse['top'] = (await admin.projections()).body.top;

    assert.deepEqual(Object.keys(top), ['GK', 'DEF', 'MID', 'FWD']);
    assert.equal(top.FWD.length, 4); // every forward in the mock league
    for (const list of Object.values(top)) {
      const points = list.map((p) => p.horizonPoints);
      assert.deepEqual(
        points,
        [...points].sort((a, b) => b - a),
      );
    }
    assert.equal(byName(top.FWD, 'Isak').pickPosition, null);
    assert.equal(byName(top.FWD, 'Haaland').pickPosition, 10);
  });

  it('serves repeat requests from the SQLite cache, and rebuilds on ?refresh=true', async () => {
    const first = await admin.projections();
    const callsAfterFirst = fplCalls.length;
    const second = await admin.projections();

    assert.equal(first.body.cache.fromCache, false);
    assert.equal(second.body.cache.fromCache, true);
    assert.equal(fplCalls.length, callsAfterFirst);
    assert.deepEqual(second.body.squad, first.body.squad);

    const refreshed = await admin.projections({ refresh: true });
    assert.equal(refreshed.body.cache.fromCache, false);
  });
});
