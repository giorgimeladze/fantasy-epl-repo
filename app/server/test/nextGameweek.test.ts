import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { FplBootstrap, FplElement } from '../src/fpl/models.js';
import type { LineupChoice, LineupPlayer, NextGameweekResponse } from '../src/nextGameweek/models.js';
import { mockFplApi } from './helpers/mockFplApi.js';
import { type ApiClient, loginAsAdmin, useTestEnvironment } from './helpers/namespace.js';

const FORMATIONS = ['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-3-2', '5-4-1'];

function bootstrap(): FplBootstrap {
  return JSON.parse(
    readFileSync(new URL('./mocks/fpl/bootstrap-static.json', import.meta.url), 'utf8'),
  ) as FplBootstrap;
}

/** Serves a bootstrap with `edit` applied. */
function withBootstrap(edit: (b: FplBootstrap) => void): void {
  const b = bootstrap();
  edit(b);
  mockFplApi({ '/bootstrap-static/': { status: 200, body: b } });
}

function editPlayer(b: FplBootstrap, name: string, changes: Partial<FplElement>): void {
  Object.assign(
    b.elements.find((e) => e.web_name === name)!,
    changes,
  );
}

const names = (players: LineupPlayer[]) => players.map((p) => p.webName);
const byName = (choice: LineupChoice, name: string) =>
  [...choice.starters, ...choice.bench].find((p) => p.webName === name)!;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe('GET /api/next-gameweek', () => {
  useTestEnvironment();
  let admin: ApiClient;

  beforeEach(async () => {
    admin = await loginAsAdmin();
  });

  it('plans the next gameweek against the current lineup', async () => {
    const { status, body } = await admin.nextGameweek();
    const next: NextGameweekResponse = body;

    assert.equal(status, 200);
    assert.equal(next.gameweek, 3);
    assert.equal(next.deadline, '2026-08-29T10:00:00Z');
    assert.equal(next.comparedWithGameweek, 2);
    assert.equal(next.current.formation, '4-4-2');
    assert.equal(byName(next.current, 'Haaland').id, next.current.captainId);
  });

  it('picks a legal XI and a bench with the backup goalkeeper first', async () => {
    const { best }: NextGameweekResponse = (await admin.nextGameweek()).body;

    assert.equal(best.starters.length, 11);
    assert.equal(best.bench.length, 4);
    assert.equal(new Set([...names(best.starters), ...names(best.bench)]).size, 15);
    assert.equal(best.starters.filter((p) => p.position === 'GK').length, 1);
    assert.equal(best.bench[0]!.position, 'GK');
    assert.ok(FORMATIONS.includes(best.formation));
    const count = (pos: string) => best.starters.filter((p) => p.position === pos).length;
    assert.equal(best.formation, `${count('DEF')}-${count('MID')}-${count('FWD')}`);
  });

  it('chooses the formation with the most predicted points, counting captain and autosubs', async () => {
    const next: NextGameweekResponse = (await admin.nextGameweek()).body;
    const { best } = next;

    assert.deepEqual(next.formations.map((f) => f.formation).sort(), [...FORMATIONS].sort());
    assert.equal(next.formations[0]!.formation, best.formation);
    assert.equal(next.formations[0]!.expectedPoints, best.expectedPoints);
    for (const f of next.formations) assert.ok(f.expectedPoints <= best.expectedPoints);

    const starters = sum(best.starters.map((p) => p.points));
    assert.ok(Math.abs(best.expectedPoints - (starters + best.captainPoints + best.autosubPoints)) < 0.05);
    assert.ok(best.expectedPoints >= next.current.expectedPoints);
    assert.equal(next.gain, Math.round((best.expectedPoints - next.current.expectedPoints) * 100) / 100);
  });

  it('keeps an injured player out and puts him last on the bench', async () => {
    const { best }: NextGameweekResponse = (await admin.nextGameweek()).body;
    const havertz = byName(best, 'Havertz'); // injured, 0 % chance

    assert.ok(!names(best.starters).includes('Havertz'));
    assert.equal(best.bench.at(-1)!.webName, 'Havertz');
    assert.equal(havertz.points, 0);
    assert.ok(
      havertz.reasons.some((r) => r.startsWith('0% chance of playing (Hamstring')),
      havertz.reasons.join(' | '),
    );
  });

  it('counts automatic substitutions for doubtful starters', async () => {
    const { current }: NextGameweekResponse = (await admin.nextGameweek()).body;

    // Gvardiol (75 %) starts in the current lineup, so the bench is expected to chip in.
    assert.ok(names(current.starters).includes('Gvardiol'));
    assert.ok(current.autosubPoints > 0);
    // FPL's own flag is quoted; the model's play chance also allows for rotation.
    const gvardiol = byName(current, 'Gvardiol');
    assert.ok(
      gvardiol.reasons.some((r) => r.startsWith('75% chance of playing')),
      gvardiol.reasons.join(' | '),
    );
    assert.ok(gvardiol.playChance < 0.75);
  });

  it('suggests the captain and vice-captain, with the top 3 options', async () => {
    const { best, captainOptions }: NextGameweekResponse = (await admin.nextGameweek()).body;
    const starterIds = best.starters.map((p) => p.id);

    assert.equal(captainOptions.length, 3);
    assert.equal(captainOptions[0]!.player.id, best.captainId);
    assert.equal(captainOptions[0]!.captainPoints, best.captainPoints);
    assert.deepEqual(
      captainOptions.map((o) => o.captainPoints),
      [...captainOptions.map((o) => o.captainPoints)].sort((a, b) => b - a),
    );
    assert.ok(starterIds.includes(best.captainId) && starterIds.includes(best.viceCaptainId));
    assert.notEqual(best.captainId, best.viceCaptainId);
  });

  it('makes the best-scoring other starter vice-captain, even when the captain is sure to play', async () => {
    const captain = (await admin.nextGameweek()).body.captainOptions[0].player.webName as string;
    withBootstrap((b) => editPlayer(b, captain, { starts: 2, minutes: 180 }));
    for (const refresh of [false, true]) {
      const { best }: NextGameweekResponse = (await admin.nextGameweek({ refresh })).body;
      const others = best.starters.filter((p) => p.id !== best.captainId);
      const top = Math.max(...others.map((p) => p.points));
      assert.equal(others.find((p) => p.id === best.viceCaptainId)!.points, top);
    }
  });

  it('moves the armband away from a doubtful captain', async () => {
    const before: NextGameweekResponse = (await admin.nextGameweek()).body;
    withBootstrap((b) =>
      editPlayer(b, before.captainOptions[0]!.player.webName, { status: 'd', chance_of_playing_next_round: 25 }),
    );
    const after: NextGameweekResponse = (await admin.nextGameweek({ refresh: true })).body;

    assert.notEqual(after.best.captainId, before.best.captainId);
    assert.ok(after.captainChange === null || after.captainChange.to.id === after.best.captainId);
  });

  it('lists the swaps that turn the current XI into the best one', async () => {
    const next: NextGameweekResponse = (await admin.nextGameweek()).body;
    const current = new Set(next.current.starters.map((p) => p.id));
    for (const change of next.changes) {
      assert.ok(current.has(change.out.id) && !current.has(change.in.id));
      current.delete(change.out.id);
      current.add(change.in.id);
      assert.equal(change.gain, Math.round((change.in.points - change.out.points) * 100) / 100);
    }
    assert.deepEqual([...current].sort(), next.best.starters.map((p) => p.id).sort());
    if (next.captainChange) assert.equal(next.captainChange.to.id, next.best.captainId);
  });

  it('pairs swaps like for like before changing the formation', async () => {
    withBootstrap((b) => {
      editPlayer(b, 'Raya', { status: 'i', chance_of_playing_next_round: 0 }); // backup keeper must start
      editPlayer(b, 'N.Jackson', { status: 'i', chance_of_playing_next_round: 0 }); // only Haaland left up front
      editPlayer(b, 'Rice', { expected_goals: '5.00' }); // a fifth midfielder worth starting
    });
    const next: NextGameweekResponse = (await admin.nextGameweek()).body;

    assert.equal(next.best.formation, '4-5-1');
    const pairs = next.changes.map((c) => `${c.in.webName}>${c.out.webName}`);
    assert.ok(pairs.includes('Alisson>Raya'), pairs.join(', '));
    // The only cross-position swap is the formation change: a midfielder for the missing forward.
    const crossPosition = next.changes.filter((c) => c.in.position !== c.out.position);
    assert.deepEqual(
      crossPosition.map((c) => `${c.in.webName}>${c.out.webName}`),
      ['Rice>N.Jackson'],
    );
  });

  it('explains each player with their fixture and where the points come from', async () => {
    const { best }: NextGameweekResponse = (await admin.nextGameweek()).body;

    for (const p of best.starters) {
      assert.match(p.reasons[0]!, /^vs [A-Z]{3} \([HA]\)$/, `${p.webName}: ${p.reasons.join(' | ')}`);
      assert.equal(p.fixtures.length, 1);
    }
    assert.ok(best.starters.some((p) => p.reasons.some((r) => /^(goals|clean sheet|assists) \d/.test(r))));
  });

  it('benches players with a blank and explains doubles', async () => {
    // Plan GW5 instead: Arsenal play twice, Man City not at all.
    withBootstrap((b) => {
      for (const e of b.events) e.is_next = e.id === 5;
    });
    const next: NextGameweekResponse = (await admin.nextGameweek()).body;
    const manCity = ['Gvardiol', 'Foden', 'Haaland'];

    assert.equal(next.gameweek, 5);
    for (const name of manCity) {
      const p = byName(next.best, name);
      assert.deepEqual(p.reasons, ['No fixture in GW5']);
      assert.equal(p.points, 0);
    }
    // With injured Havertz that's 4 players on 0 for 3 outfield bench spots, so exactly one starts.
    const zeroStarters = next.best.starters.filter((p) => p.points === 0);
    assert.equal(zeroStarters.length, 1, names(zeroStarters).join(', '));
    assert.ok(names(next.best.bench).filter((n) => [...manCity, 'Havertz'].includes(n)).length === 3);
    assert.equal(byName(next.best, 'Raya').reasons[0], 'Double gameweek: CHE (H), LIV (A)');
    assert.equal(byName(next.best, 'Raya').fixtures.length, 2);
  });

  describe('price watch', () => {
    it('flags squad players whose price is about to move, soonest first', async () => {
      const { priceWatch }: NextGameweekResponse = (await admin.nextGameweek()).body;

      assert.equal(priceWatch.available, true);
      assert.deepEqual(
        priceWatch.squad.map((h) => [h.webName, h.direction, h.chance, h.updatesAway]),
        [
          ['Saka', 'rise', 'likely', 0],
          ['Havertz', 'fall', 'likely', 1],
          ['Rice', 'fall', 'possible', 2],
        ],
      );
      const saka = priceWatch.squad[0]!;
      assert.equal(saka.progressPercent, 84);
      assert.equal(saka.netTransfers, 49000);
      assert.equal(saka.changeThisGameweek, 0.1);
      assert.equal(saka.price, 10);
    });

    it('lists the league’s likeliest risers and fallers, skipping locked prices', async () => {
      const { priceWatch }: NextGameweekResponse = (await admin.nextGameweek()).body;

      // Haaland's price is locked, so his "rise" can't happen yet; Rice is only "possible".
      assert.deepEqual(
        priceWatch.risers.map((h) => [h.webName, h.inSquad]),
        [
          ['Saka', true],
          ['Isak', false],
        ],
      );
      assert.deepEqual(
        priceWatch.fallers.map((h) => h.webName),
        ['Havertz'],
      );
    });

    it('says so when FPL stops publishing price data', async () => {
      withBootstrap((b) => {
        for (const e of b.elements) {
          delete e.price_change_projections;
          delete e.price_change_percent;
        }
      });
      const { priceWatch }: NextGameweekResponse = (await admin.nextGameweek()).body;

      assert.deepEqual(priceWatch, { available: false, squad: [], risers: [], fallers: [] });
    });
  });

  it('includes differentials from the projections', async () => {
    const { differentials }: NextGameweekResponse = (await admin.nextGameweek()).body;
    assert.deepEqual(
      differentials.FWD.map((p) => p.webName),
      ['Isak'],
    );
  });

  it('serves repeat requests from the SQLite cache, and rebuilds on ?refresh=true', async () => {
    const first = await admin.nextGameweek();
    const second = await admin.nextGameweek();
    assert.equal(first.body.cache.fromCache, false);
    assert.equal(second.body.cache.fromCache, true);
    assert.deepEqual(second.body.best, first.body.best);
    assert.equal((await admin.nextGameweek({ refresh: true })).body.cache.fromCache, false);
  });
});
