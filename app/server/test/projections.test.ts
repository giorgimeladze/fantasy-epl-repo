import assert from 'node:assert/strict';
import type { PlayerProjection, ProjectionsResponse } from '../src/projections/models.js';
import { api, fplCalls } from './setup.js';

const byName = (players: PlayerProjection[], name: string) => players.find((p) => p.webName === name)!;

describe('GET /api/projections', () => {
  it('projects the squad in pick order for the upcoming gameweeks', async () => {
    const res = await api.projections();
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
    const squad: PlayerProjection[] = (await api.projections()).body.squad;
    const raya = byName(squad, 'Raya'); // Arsenal play twice in GW5
    const haaland = byName(squad, 'Haaland'); // Man City don't play in GW5

    const gw5 = raya.gameweeks[2]!;
    assert.deepEqual(
      gw5.fixtures.map((f) => `${f.opponent}${f.isHome ? 'H' : 'A'}`),
      ['CHEH', 'LIVA'],
    );
    assert.ok(Math.abs(gw5.points - (gw5.fixtures[0]!.points + gw5.fixtures[1]!.points)) < 0.011);
    assert.ok(gw5.points > raya.gameweeks[1]!.points);

    assert.deepEqual(haaland.gameweeks[2], { gameweek: 5, points: 0, playChance: 0, fixtures: [] });
  });

  it('explains each fixture with a breakdown that adds up to its points', async () => {
    const fixture = byName((await api.projections()).body.squad, 'M.Salah').gameweeks[0]!.fixtures[0]!;

    assert.equal(fixture.opponent, 'ARS');
    assert.equal(fixture.isHome, false);
    assert.equal(fixture.difficulty, 4);
    const sum = Object.values(fixture.breakdown).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - fixture.points) < 0.05);
    assert.ok(fixture.breakdown.goals > 0 && fixture.expectedMinutes > 0);
  });

  it('shows the inputs behind every number, so each line of the breakdown can be recomputed', async () => {
    const { squad }: ProjectionsResponse = (await api.projections()).body;
    const near = (actual: number, expected: number, what: string) =>
      assert.ok(Math.abs(actual - expected) < 0.06, `${what}: ${actual} vs ${expected}`);
    let checked = 0;

    for (const p of squad) {
      for (const f of p.gameweeks.flatMap((g) => g.fixtures)) {
        const i = f.inputs;
        const what = `${p.webName} vs ${f.opponent}`;
        const startChance = i.availability * i.startShare;
        const minutes = startChance * i.minutesPerStart + i.subChance * i.subMinutes;
        const share90 = minutes / 90;
        const attack = i.opponentDefence * i.venueFactor * f.headToHeadFactor;

        near(f.startChance, startChance, `${what} start chance`);
        assert.ok(Math.abs(f.expectedMinutes - minutes) <= 0.5, `${what} minutes`); // whole minutes in the response
        near(f.breakdown.appearance, startChance + i.subChance + i.sixtyMinuteChance, `${what} appearance`);
        near(f.breakdown.goals, i.goalsPer90 * share90 * attack * i.goalPoints, `${what} goals`);
        near(f.breakdown.assists, i.assistsPer90 * share90 * attack * i.assistPoints, `${what} assists`);
        near(
          i.expectedGoalsAgainst,
          (i.leagueGoalsPerMatch * i.opponentAttack * i.clubDefence) / i.venueFactor,
          `${what} goals against`,
        );
        near(f.cleanSheetChance, Math.exp(-i.expectedGoalsAgainst), `${what} clean sheet chance`);
        near(
          f.breakdown.cleanSheet,
          i.sixtyMinuteChance * f.cleanSheetChance * i.cleanSheetPoints,
          `${what} clean sheet`,
        );
        near(f.breakdown.bonus, i.bonusPer90 * share90 * f.headToHeadFactor, `${what} bonus`);
        near(f.breakdown.cards, -i.cardPointsPer90 * share90, `${what} cards`);
        near(f.breakdown.defensiveContribution, startChance * i.defensiveContributionChance * 2, `${what} DC`);
        assert.equal(i.venueFactor > 1, f.isHome);
        checked++;
      }
    }
    assert.ok(checked > 20, String(checked));
    // FPL's points per goal for the position.
    assert.deepEqual(
      ['Raya', 'Saliba', 'Saka', 'Haaland'].map((n) => byName(squad, n).gameweeks[0]!.fixtures[0]!.inputs.goalPoints),
      [10, 6, 5, 4],
    );
    assert.equal(byName(squad, 'Raya').gameweeks[0]!.fixtures[0]!.inputs.defensiveThreshold, null);
  });

  it('uses FPL’s injury flags and shows FPL’s own forecast', async () => {
    const squad: PlayerProjection[] = (await api.projections()).body.squad;
    const havertz = byName(squad, 'Havertz'); // injured, 0 % chance next round

    assert.equal(havertz.status, 'i');
    assert.equal(havertz.nextGameweekPoints, 0);
    assert.equal(havertz.gameweeks[0]!.fixtures[0]!.expectedMinutes, 0);
    assert.ok(havertz.gameweeks[1]!.points > 0); // assumed to be recovering
    assert.equal(byName(squad, 'M.Salah').fplExpectedPoints, 6.8);
  });

  it('adjusts for the record against the opponent from past seasons', async () => {
    const squad: PlayerProjection[] = (await api.projections()).body.squad;
    // Salah's last 4 vs Arsenal average 6.25 against 5.4 overall → 1 + 0.15 × (6.25/5.4 − 1).
    const factor = byName(squad, 'M.Salah').gameweeks[0]!.fixtures[0]!.headToHeadFactor;
    assert.equal(factor, Math.round((1 + 0.15 * (6.25 / 5.4 - 1)) * 100) / 100);
    // Haaland has a single past match against nobody he plays next: neutral.
    assert.equal(byName(squad, 'Haaland').gameweeks[0]!.fixtures[0]!.headToHeadFactor, 1);
  });

  it('lists the top players per position across the league, marking squad players', async () => {
    const top: ProjectionsResponse['top'] = (await api.projections()).body.top;

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

  it('gives each gameweek a chance of playing, higher in a double gameweek', async () => {
    const raya = byName((await api.projections()).body.squad, 'Raya');
    const [gw3, , gw5] = raya.gameweeks;

    assert.equal(gw3!.playChance, gw3!.fixtures[0]!.playChance);
    assert.ok(gw3!.fixtures[0]!.playChance >= gw3!.fixtures[0]!.startChance);
    assert.ok(gw5!.playChance >= Math.max(...gw5!.fixtures.map((f) => f.playChance)));
    assert.equal(byName((await api.projections()).body.squad, 'Havertz').gameweeks[0]!.playChance, 0);
  });

  it('lists differentials: players outside the squad owned by under 10 %', async () => {
    const body: ProjectionsResponse = (await api.projections()).body;

    // Isak (4.2 %) is the only player outside the squad in the mock league.
    assert.deepEqual(
      body.differentials.FWD.map((p) => [p.webName, p.selectedByPercent, p.pickPosition]),
      [['Isak', 4.2, null]],
    );
    assert.deepEqual(body.differentials.MID, []);
    // Squad players are never differentials, however few managers own them.
    assert.ok(byName(body.squad, 'Raya').selectedByPercent < 10);
    assert.ok(
      !Object.values(body.differentials)
        .flat()
        .some((p) => p.webName === 'Raya'),
    );
  });

  it('serves repeat requests from the SQLite cache, and rebuilds on ?refresh=true', async () => {
    const first = await api.projections();
    const callsAfterFirst = fplCalls.length;
    const second = await api.projections();

    assert.equal(first.body.cache.fromCache, false);
    assert.equal(second.body.cache.fromCache, true);
    assert.equal(fplCalls.length, callsAfterFirst);
    assert.deepEqual(second.body.squad, first.body.squad);

    const refreshed = await api.projections({ refresh: true });
    assert.equal(refreshed.body.cache.fromCache, false);
  });
});
