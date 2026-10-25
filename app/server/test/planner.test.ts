import assert from 'node:assert/strict';
import type { FplBootstrap, FplElement, FplEntryHistory } from '../src/fpl/models.js';
import type { ChipAdvice, DraftPlanResponse, PlannerResponse } from '../src/planner/models.js';
import { api, bootstrap, fplReturns, MOCK_TEAM_ID } from './setup.js';

/** Serves a bootstrap with extra players (copied from an existing one) and any other edit. */
function withBootstrap(
  extra: Array<{ like: string } & Partial<FplElement>>,
  edit: (b: FplBootstrap) => void = () => {},
) {
  const b = bootstrap();
  for (const [i, { like, ...changes }] of extra.entries()) {
    const base = b.elements.find((e) => e.web_name === like)!;
    b.elements.push({ ...base, id: 100 + i, code: 200000 + i, selected_by_percent: '2.0', ...changes });
  }
  edit(b);
  fplReturns('/bootstrap-static/', b);
}

// Chelsea and Man City already have 3 of the squad: Delap can only replace N.Jackson, Dias a Man City defender.
const DELAP = { like: 'N.Jackson', web_name: 'Delap', now_cost: 55, expected_goals: '1.60' }; // id 100
const DIAS = {
  like: 'Gvardiol',
  web_name: 'Dias',
  now_cost: 55,
  status: 'a',
  news: '',
  chance_of_playing_next_round: null,
  minutes: 180,
  starts: 2,
  expected_goals: '0.40',
}; // id 101
const JACKSON = 14;
const GVARDIOL = 6;
const HAVERTZ = 15;
const SALAH = 9;
const ISAK = 16;

function withChipsPlayed(chips: Array<{ name: string; event: number }>) {
  const current: FplEntryHistory[] = [1, 2].map((event) => ({
    event,
    points: 50,
    total_points: 50 * event,
    rank: null,
    bank: 5,
    value: 1000,
    event_transfers: event === 2 ? 1 : 0,
    event_transfers_cost: 0,
    points_on_bench: 0,
  }));
  fplReturns(`/entry/${MOCK_TEAM_ID}/history/`, {
    current,
    past: [],
    chips: chips.map((c) => ({ ...c, time: '2026-08-20T00:00:00Z' })),
  });
}

const chip = (planner: PlannerResponse, name: string): ChipAdvice => planner.chips.find((c) => c.chip.name === name)!;
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const close = (a: number, b: number, message?: string) => assert.ok(Math.abs(a - b) < 0.05, message ?? `${a} ≈ ${b}`);

describe('GET /api/planner', () => {
  describe('chips', () => {
    it('lists every chip with its window from FPL', async () => {
      const planner: PlannerResponse = (await api.planner()).body;

      assert.equal(planner.gameweek, 3);
      assert.deepEqual(planner.gameweeks, [3, 4, 5]);
      assert.deepEqual(
        planner.chips.map((c) => [c.chip.name, c.chip.label, c.chip.available, c.chip.availableUntil]),
        [
          ['wildcard', 'Wildcard', true, 19],
          ['freehit', 'Free Hit', true, 19],
          ['bboost', 'Bench Boost', true, 19],
          ['3xc', 'Triple Captain', true, 19],
        ],
      );
      for (const c of planner.chips)
        assert.deepEqual(
          c.weeks.map((w) => w.gameweek),
          [3, 4, 5],
        );
    });

    it('marks a chip played in this half as used', async () => {
      withChipsPlayed([{ name: 'bboost', event: 2 }]);
      const bboost = chip((await api.planner()).body, 'bboost');

      assert.equal(bboost.chip.available, false);
      assert.equal(bboost.chip.playedInGameweek, 2);
      assert.equal(bboost.bestGameweek, null);
      assert.equal(bboost.verdict, 'Already played in GW2.');
    });

    it('assumes one of each chip per season when FPL publishes no chip windows', async () => {
      withBootstrap([], (b) => delete b.chips);
      const planner: PlannerResponse = (await api.planner()).body;
      for (const c of planner.chips) assert.deepEqual([c.chip.available, c.chip.availableUntil], [true, 38]);
    });

    it('values Bench Boost as the bench’s points minus what autosubs bring in anyway', async () => {
      const bboost = chip((await api.planner()).body, 'bboost');

      for (const week of bboost.weeks) {
        assert.equal(week.players.length, 4);
        assert.equal(week.players[0]!.position, 'GK');
        const [, bench, autosubs] = /^bench ([\d.]+) − ([\d.]+) already expected from autosubs$/.exec(
          week.explanation,
        )!;
        // The explanation rounds each number to 0.1.
        assert.ok(Math.abs(Number(bench) - sum(week.players.map((p) => p.points))) <= 0.051);
        assert.ok(Math.abs(week.value - (Number(bench) - Number(autosubs))) <= 0.11, week.explanation);
      }
      const best = [...bboost.weeks].sort((a, b) => b.value - a.value)[0]!;
      assert.equal(bboost.bestGameweek, best.gameweek);
      assert.match(bboost.verdict, new RegExp(`^Best in GW${best.gameweek}: \\+`));
    });

    it('times the Triple Captain for a double gameweek', async () => {
      const triple = chip((await api.planner()).body, '3xc');

      // Arsenal play twice in GW5.
      assert.equal(triple.bestGameweek, 5);
      const gw5 = triple.weeks.find((w) => w.gameweek === 5)!;
      assert.equal(gw5.players[0]!.clubShortName, 'ARS');
      assert.match(gw5.explanation, /double gameweek/);
      for (const w of triple.weeks) assert.ok(w.value >= w.players[0]!.points - 0.01, w.explanation);
    });

    it('finds nothing for Free Hit or Wildcard when no legal transfer exists', async () => {
      const planner: PlannerResponse = (await api.planner()).body;

      for (const name of ['freehit', 'wildcard']) {
        const c = chip(planner, name);
        assert.equal(c.bestGameweek, null);
        assert.deepEqual(
          c.weeks.map((w) => w.value),
          [0, 0, 0],
        );
      }
      // Man City blank in GW5: 3 of the squad.
      assert.match(chip(planner, 'freehit').weeks[2]!.explanation, /\(3 of yours without a fixture\)$/);
      assert.equal(chip(planner, 'freehit').verdict, 'Adds nothing in the coming gameweeks.');
    });

    it('builds a Free Hit squad for each week from the budget', async () => {
      withBootstrap([DELAP]);
      const freehit = chip((await api.planner()).body, 'freehit');

      for (const week of freehit.weeks) {
        assert.ok(week.value > 0, week.explanation);
        assert.deepEqual(
          week.players.map((p) => p.webName),
          ['Delap'],
        );
        const [, after, before] = /^Free Hit squad ([\d.]+) vs yours ([\d.]+)/.exec(week.explanation)!;
        close(week.value, Number(after) - Number(before));
      }
    });

    it('suggests the Wildcard only when it beats the best transfers by 10+ points', async () => {
      withBootstrap([DELAP, DIAS]);
      const small = chip((await api.planner()).body, 'wildcard');
      assert.deepEqual(small.wildcard!.in.map((p) => p.webName).sort(), ['Delap', 'Dias']);
      assert.deepEqual(small.wildcard!.out.map((p) => p.webName).sort(), ['Gvardiol', 'N.Jackson']);
      close(small.wildcard!.gain, sum(small.weeks.map((w) => w.value)));
      assert.equal(small.wildcard!.bankAfter, 2.8); // 0.5 + 6.0 + 7.3 − 5.5 − 5.5 (Gvardiol sells for 6.0)
      assert.ok(small.wildcard!.gain - small.wildcard!.bestTransfersGain < 10);
      assert.equal(small.bestGameweek, null);
      assert.match(small.verdict, /^Not yet: /);

      // Four big upgrades: the best normal transfers make two (one with a hit), the Wildcard all four.
      withBootstrap([
        { ...DELAP, expected_goals: '9.00' },
        { ...DIAS, expected_goals: '9.00' },
        { like: 'Virgil', web_name: 'Konaté', now_cost: 55, expected_goals: '9.00' },
        { like: 'M.Salah', web_name: 'Szoboszlai', now_cost: 70, expected_goals: '9.00' },
      ]);
      const big = chip((await api.planner({ refresh: true })).body, 'wildcard');
      assert.equal(big.wildcard!.in.length, 4);
      assert.ok(big.wildcard!.gain - big.wildcard!.bestTransfersGain >= 10, JSON.stringify(big.wildcard));
      assert.equal(big.bestGameweek, 3);
      assert.match(big.verdict, /^Worth considering now: /);
    });
  });

  describe('rotation', () => {
    it('pairs defences whose fixtures cover each other, best total first', async () => {
      const { rotation }: PlannerResponse = (await api.planner()).body;

      assert.equal(rotation.defences[0]!.clubs.join('+'), 'ARS+MCI');
      for (const pair of rotation.defences) {
        close(pair.total, sum(pair.weeks.map((w) => w.value)));
        for (const w of pair.weeks) assert.ok(w.value >= w.other && pair.clubs.includes(w.pick));
        // Each club plays at least once: a real rotation.
        for (const club of pair.clubs)
          assert.ok(
            pair.weeks.some((w) => w.pick === club),
            pair.clubs.join('+'),
          );
        assert.ok(pair.total >= pair.bestSingle);
      }
      // Arsenal cover Man City's blank in GW5.
      assert.equal(rotation.defences[0]!.weeks[2]!.pick, 'ARS');
      assert.deepEqual(
        rotation.defences.map((p) => p.total),
        [...rotation.defences.map((p) => p.total)].sort((a, b) => b - a),
      );
    });

    it('pairs goalkeepers only within the £10m budget', async () => {
      // Raya + Alisson cost £11.0m.
      assert.deepEqual((await api.planner()).body.rotation.goalkeepers, []);

      withBootstrap([], (b) => {
        b.elements.find((e) => e.web_name === 'Raya')!.now_cost = 45;
      });
      const { rotation }: PlannerResponse = (await api.planner({ refresh: true })).body;
      const pair = rotation.goalkeepers[0];
      if (pair) {
        assert.equal(pair.price, 10);
        assert.deepEqual(pair.players.map((p) => p.webName).sort(), ['Alisson', 'Raya']);
      }
    });
  });

  it('serves repeat requests from the SQLite cache, and rebuilds on ?refresh=true', async () => {
    const first = await api.planner();
    const second = await api.planner();
    assert.equal(first.body.cache.fromCache, false);
    assert.equal(second.body.cache.fromCache, true);
    assert.equal((await api.planner({ refresh: true })).body.cache.fromCache, false);
  });
});

describe('/api/planner/draft', () => {
  it('starts empty: the squad as it is, with free transfers banking each week', async () => {
    const draft: DraftPlanResponse = (await api.draft()).body;

    assert.deepEqual(draft.transfers, []);
    assert.equal(draft.updatedAt, null);
    assert.deepEqual(
      draft.weeks.map((w) => [w.gameweek, w.freeTransfers, w.hitCost, w.bankAfter]),
      [
        [3, 1, 0, 0.5],
        [4, 2, 0, 0.5],
        [5, 3, 0, 0.5],
      ],
    );
    assert.equal(draft.gain, 0);
    assert.equal(draft.totalPoints, draft.baselinePoints);
    for (const w of draft.weeks) {
      const { lineup } = w;
      close(lineup.expectedPoints, lineup.startersPoints + lineup.captainPoints + lineup.autosubPoints);
      assert.equal(w.netPoints, lineup.expectedPoints);
      assert.equal(w.baselinePoints, lineup.expectedPoints);
      assert.equal(w.squad.length, 15);
    }
    assert.equal(draft.squad.length, 15);
    assert.deepEqual(Object.keys(draft.market), ['GK', 'DEF', 'MID', 'FWD']);
  });

  it('matches the Next GW page for the first gameweek', async () => {
    const [draft, next] = [(await api.draft()).body as DraftPlanResponse, (await api.nextGameweek()).body];
    assert.equal(draft.weeks[0]!.lineup.expectedPoints, next.best.expectedPoints);
    assert.equal(draft.weeks[0]!.lineup.captainId, next.best.captainId);
  });

  it('saves a plan and replays it: points, bank and free transfers update', async () => {
    withBootstrap([DELAP]);
    const saved = await api.saveDraft({ transfers: [{ gameweek: 3, outId: JACKSON, inId: 100 }] });
    assert.equal(saved.status, 200, saved.body.error);
    const draft: DraftPlanResponse = saved.body;

    assert.deepEqual(
      draft.weeks[0]!.moves.map((m) => [m.out.webName, m.in.webName, m.sellingPrice, m.buyingPrice]),
      [['N.Jackson', 'Delap', 7.3, 5.5]],
    );
    assert.deepEqual(
      draft.weeks.map((w) => [w.freeTransfers, w.hitCost, w.bankAfter]),
      [
        [1, 0, 2.3],
        [1, 0, 2.3],
        [2, 0, 2.3],
      ],
    );
    assert.ok(draft.weeks.every((w) => w.squad.includes(100) && !w.squad.includes(JACKSON)));
    assert.ok(draft.gain > 0);
    close(draft.gain, draft.totalPoints - draft.baselinePoints);
    assert.ok(draft.updatedAt);

    const again: DraftPlanResponse = (await api.draft()).body;
    assert.deepEqual(again.transfers, [{ gameweek: 3, outId: JACKSON, inId: 100 }]);
    assert.equal(again.totalPoints, draft.totalPoints);
  });

  it('banks a free transfer when the move waits a week', async () => {
    withBootstrap([DELAP]);
    const draft: DraftPlanResponse = (await api.saveDraft({ transfers: [{ gameweek: 4, outId: JACKSON, inId: 100 }] }))
      .body;
    assert.deepEqual(
      draft.weeks.map((w) => [w.freeTransfers, w.moves.length, w.hitCost]),
      [
        [1, 0, 0],
        [2, 1, 0],
        [2, 0, 0],
      ],
    );
    assert.equal(draft.weeks[0]!.baselinePoints, draft.weeks[0]!.netPoints);
  });

  it('charges 4 points for each transfer beyond the free ones', async () => {
    withBootstrap([DELAP, DIAS]);
    const draft: DraftPlanResponse = (
      await api.saveDraft({
        transfers: [
          { gameweek: 3, outId: JACKSON, inId: 100 },
          { gameweek: 3, outId: GVARDIOL, inId: 101 },
        ],
      })
    ).body;
    const gw3 = draft.weeks[0]!;
    assert.equal(gw3.hitCost, 4);
    close(gw3.netPoints, gw3.lineup.expectedPoints - 4);
    assert.equal(gw3.bankAfter, 2.8);
    assert.equal(draft.weeks[1]!.freeTransfers, 1);
  });

  it('suggests the next best transfer for the planned squad', async () => {
    // Worth +1.2: less than the 1.5 a banked free transfer is worth, so saving wins every week.
    withBootstrap([DELAP]);
    assert.ok(((await api.draft()).body as DraftPlanResponse).weeks.every((w) => w.suggestion === null));

    withBootstrap([{ ...DELAP, expected_goals: '9.00' }]);
    const empty: DraftPlanResponse = (await api.draft()).body;
    for (const week of empty.weeks) {
      assert.deepEqual(
        week.suggestion!.moves.map((m) => `${m.out.webName}>${m.in.webName}`),
        ['N.Jackson>Delap'],
      );
      // Over the rest of the horizon only.
      assert.equal(week.suggestion!.gainPerGameweek.length, 6 - week.gameweek);
    }

    const planned: DraftPlanResponse = (
      await api.saveDraft({ transfers: [{ gameweek: 3, outId: JACKSON, inId: 100 }] })
    ).body;
    assert.ok(planned.weeks.every((w) => w.suggestion === null));
  });

  describe('rules', () => {
    const rejects = async (transfers: object[], pattern: RegExp) => {
      const res = await api.saveDraft({ transfers });
      assert.equal(res.status, 400);
      assert.match(res.body.error, pattern);
    };

    it('rejects a move that breaks an FPL rule, naming it, and keeps the old plan', async () => {
      withBootstrap([DELAP]);
      await rejects(
        [{ gameweek: 3, outId: SALAH, inId: 100 }],
        /^GW3: M\.Salah \(MID\) can only be replaced by a MID, not Delap \(FWD\)$/,
      );
      await rejects([{ gameweek: 3, outId: HAVERTZ, inId: 100 }], /^GW3: Delap would make 4 CHE players \(max 3\)$/);
      await rejects(
        [{ gameweek: 3, outId: JACKSON, inId: ISAK }],
        /^GW3: can't afford Isak for N\.Jackson \(£1\.2m short\)$/,
      );
      await rejects([{ gameweek: 4, outId: 100, inId: JACKSON }], /^GW4: Delap isn't in the squad by then$/);
      await rejects([{ gameweek: 3, outId: JACKSON, inId: 13 }], /Haaland is already in the squad/);
      await rejects([{ gameweek: 9, outId: JACKSON, inId: 100 }], /^GW9 isn't in the plan$/);
      assert.deepEqual((await api.draft()).body.transfers, []);
    });

    it('rejects a body of the wrong shape', async () => {
      await rejects([{ gameweek: '3', outId: JACKSON, inId: 100 }], /integer "gameweek", "outId" and "inId"/);
      const res = await api.saveDraft({ moves: [] });
      assert.equal(res.status, 400);
    });

    it('allows a chain: sell in a later week a player bought earlier', async () => {
      withBootstrap([DELAP, { like: 'N.Jackson', web_name: 'Guiu', now_cost: 45 }]);
      const res = await api.saveDraft({
        transfers: [
          { gameweek: 3, outId: JACKSON, inId: 100 },
          { gameweek: 4, outId: 100, inId: 101 },
        ],
      });
      assert.equal(res.status, 200, res.body.error);
      assert.equal((res.body as DraftPlanResponse).weeks[1]!.bankAfter, 3.3); // 2.3 + 5.5 − 4.5
    });
  });

  it('drops moves for past gameweeks and moves that no longer work, with a warning', async () => {
    withBootstrap([DELAP]);
    await api.saveDraft({ transfers: [{ gameweek: 3, outId: JACKSON, inId: 100 }] });
    // GW3 has gone.
    withBootstrap([DELAP], (b) => {
      for (const e of b.events) e.is_next = e.id === 4;
    });
    const draft: DraftPlanResponse = (await api.draft()).body;
    assert.deepEqual(draft.gameweeks, [4, 5]);
    assert.deepEqual(draft.transfers, []);
    assert.deepEqual(draft.warnings, ['1 planned transfer(s) for past gameweeks were dropped.']);

    withBootstrap([DELAP]);
    await api.saveDraft({ transfers: [{ gameweek: 4, outId: JACKSON, inId: 100 }] });
    withBootstrap([]); // Delap has left the league
    const broken: DraftPlanResponse = (await api.draft()).body;
    assert.deepEqual(broken.transfers, []);
    assert.deepEqual(broken.warnings, ['GW4: unknown player 100']);
  });

  it('clears the plan', async () => {
    withBootstrap([DELAP]);
    await api.saveDraft({ transfers: [{ gameweek: 3, outId: JACKSON, inId: 100 }] });
    const cleared: DraftPlanResponse = (await api.clearDraft()).body;
    assert.deepEqual(cleared.transfers, []);
    assert.deepEqual((await api.draft()).body.transfers, []);
  });
});
