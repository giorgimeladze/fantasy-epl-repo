import assert from 'node:assert/strict';
import type { FplBootstrap, FplElement, FplEntryHistory } from '../src/fpl/models.js';
import type { TransferOption, TransfersResponse } from '../src/transfers/models.js';
import { api, bootstrap, fplCalls, fplReturns, MOCK_TEAM_ID } from './setup.js';

/** Serves a bootstrap with extra players, each copied from an existing one with `changes`. */
function withPlayers(extra: Array<{ like: string } & Partial<FplElement>>, edit: (b: FplBootstrap) => void = () => {}) {
  const b = bootstrap();
  for (const [i, { like, ...changes }] of extra.entries()) {
    const base = b.elements.find((e) => e.web_name === like)!;
    b.elements.push({ ...base, id: 100 + i, code: 200000 + i, selected_by_percent: '2.0', ...changes });
  }
  edit(b);
  fplReturns('/bootstrap-static/', b);
}

// Chelsea already has 3 of the squad, so Delap can only replace N.Jackson; Dias only a Man City defender.
const DELAP = { like: 'N.Jackson', web_name: 'Delap', now_cost: 55, expected_goals: '1.60', form: '6.0' };
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
};

/** Serves /entry/{id}/history/ with `transfers[i]` transfers in GW i+1 and the given chips. */
function withHistory(transfers: number[], chips: Array<{ name: string; event: number }> = []) {
  const current: FplEntryHistory[] = transfers.map((count, i) => ({
    event: i + 1,
    points: 50,
    total_points: 50 * (i + 1),
    rank: null,
    bank: 5,
    value: 1000,
    event_transfers: count,
    event_transfers_cost: 0,
    points_on_bench: 0,
  }));
  fplReturns(`/entry/${MOCK_TEAM_ID}/history/`, {
    current,
    past: [],
    chips: chips.map((c) => ({ ...c, time: '2026-08-01T00:00:00Z' })),
  });
}

const moves = (option: TransferOption) => option.moves.map((m) => `${m.out.webName}>${m.in.webName}`).join(',');
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
const round2 = (value: number) => Math.round(value * 100) / 100;

describe('GET /api/transfers', () => {
  describe('free transfers', () => {
    it('replays the season: the first squad is free, then +1 a week minus the transfers made', async () => {
      const t: TransfersResponse = (await api.transfers()).body;

      assert.equal(t.gameweek, 3);
      assert.deepEqual(t.gameweeks, [3, 4, 5]);
      assert.equal(t.freeTransfers, 1);
      assert.equal(t.maxFreeTransfers, 5);
      assert.deepEqual(t.freeTransferHistory, [
        { gameweek: 1, transfers: 0, chip: null, freeAfter: 1 },
        { gameweek: 2, transfers: 1, chip: null, freeAfter: 1 },
      ]);
    });

    it('banks unused transfers up to 5', async () => {
      withHistory([0, 0, 0, 0, 0, 0, 0]);
      const t: TransfersResponse = (await api.transfers()).body;
      assert.deepEqual(
        t.freeTransferHistory.map((w) => w.freeAfter),
        [1, 2, 3, 4, 5, 5, 5],
      );
      assert.equal(t.freeTransfers, 5);
    });

    it('never goes below 1 after a hit', async () => {
      withHistory([0, 0, 3]);
      const t: TransfersResponse = (await api.transfers()).body;
      assert.deepEqual(
        t.freeTransferHistory.map((w) => w.freeAfter),
        [1, 2, 1],
      );
    });

    it('keeps the bank unchanged through a Wildcard or Free Hit', async () => {
      withHistory(
        [0, 0, 9, 0, 6, 1],
        [
          { name: 'wildcard', event: 3 },
          { name: 'freehit', event: 5 },
        ],
      );
      const t: TransfersResponse = (await api.transfers()).body;
      assert.deepEqual(
        t.freeTransferHistory.map((w) => [w.chip, w.freeAfter]),
        [
          [null, 1],
          [null, 2],
          ['wildcard', 2],
          [null, 3],
          ['freehit', 3],
          [null, 3],
        ],
      );
    });

    it('uses only the public history and transfer list, never /my-team', async () => {
      await api.transfers();
      assert.ok(fplCalls.includes(`/entry/${MOCK_TEAM_ID}/history/`));
      assert.ok(fplCalls.includes(`/entry/${MOCK_TEAM_ID}/transfers/`));
      assert.ok(!fplCalls.some((path) => path.includes('my-team')));
    });
  });

  describe('selling prices', () => {
    it('gives back the purchase price plus half of any rise, rounded down, and a fall in full', async () => {
      const t: TransfersResponse = (await api.transfers()).body;
      const sale = (name: string) => {
        const s = t.squad.find((p) => p.webName === name)!;
        return [s.price, s.purchasePrice, s.sellingPrice, s.boughtInGameweek];
      };

      assert.equal(t.bank, 0.5);
      assert.equal(t.squad.length, 15);
      // First-squad players were bought at the season's starting price.
      assert.deepEqual(sale('Saka'), [10, 9.7, 9.8, null]); // +0.3 → +0.1
      assert.deepEqual(sale('Haaland'), [15, 14.6, 14.8, null]); // +0.4 → +0.2
      assert.deepEqual(sale('Palmer'), [10.5, 10.6, 10.5, null]); // −0.1 passed on
      assert.deepEqual(sale('Raya'), [5.5, 5.5, 5.5, null]);
      // Bought in GW2 for £7.2m.
      assert.deepEqual(sale('N.Jackson'), [7.5, 7.2, 7.3, 2]);
    });

    it('lists the squad by position, most valuable first', async () => {
      const { squad }: TransfersResponse = (await api.transfers()).body;
      assert.deepEqual(
        squad.map((s) => s.position),
        ['GK', 'GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD'],
      );
      assert.deepEqual(
        squad.filter((s) => s.position === 'FWD').map((s) => s.webName),
        ['Haaland', 'Havertz', 'N.Jackson'],
      );
    });
  });

  describe('suggestions', () => {
    it('saves the transfer when no legal move exists (every club already has 3 of the squad)', async () => {
      const t: TransfersResponse = (await api.transfers()).body;

      assert.deepEqual(t.single, []);
      assert.deepEqual(t.double, []);
      assert.deepEqual(t.recommended, t.save);
      assert.deepEqual(t.save.moves, []);
      assert.equal(t.save.gain, 0);
      assert.equal(t.save.freeTransfersNext, 2);
      assert.equal(t.save.bankAfter, 0.5);
      assert.ok(t.squadPoints > 0);
    });

    it('suggests the move with the most predicted points, keeping to budget, positions and 3 per club', async () => {
      withPlayers([DELAP, DIAS]);
      const t: TransfersResponse = (await api.transfers()).body;

      assert.equal(moves(t.recommended), 'Gvardiol>Dias');
      assert.deepEqual(t.single.map(moves), ['Gvardiol>Dias', 'N.Jackson>Delap']);
      // Havertz (injured, Arsenal) for Delap would make 4 Chelsea players.
      assert.ok(!t.single.some((o) => moves(o) === 'Havertz>Delap'));

      const [dias, delap] = t.single;
      assert.equal(dias!.bankAfter, 1); // 0.5 + 6.0 − 5.5
      assert.equal(delap!.bankAfter, 2.3); // 0.5 + 7.3 − 5.5
      assert.equal(delap!.moves[0]!.sellingPrice, 7.3);
      // Every gain is against the squad's own points each week.
      assert.equal(t.squadPerGameweek.length, 3);
      assert.ok(Math.abs(sum(t.squadPerGameweek) - t.squadPoints) < 0.05);
      for (const option of [...t.single, ...t.double]) {
        assert.ok(option.bankAfter >= 0);
        for (const m of option.moves) assert.equal(m.in.position, m.out.position);
        assert.ok(Math.abs(option.gain - sum(option.gainPerGameweek)) < 0.05);
      }
    });

    it('explains both players with fixtures, form, availability and where the points come from', async () => {
      withPlayers([DELAP, DIAS]);
      const { recommended }: TransfersResponse = (await api.transfers()).body;
      const { out, in: incoming, gain } = recommended.moves[0]!;

      assert.deepEqual(out.reasons.slice(0, 3), [
        'fixtures: CHE (H), LIV (A), blank',
        'form 1.0',
        '75% chance of playing (Knock - 75% chance of playing)',
      ]);
      assert.equal(incoming.reasons[0], 'fixtures: CHE (H), LIV (A), blank');
      assert.ok(
        incoming.reasons.some((r) => r.startsWith('clean sheet ')),
        incoming.reasons.join(' | '),
      );
      assert.deepEqual(incoming.gameweekPoints.length, 3);
      assert.equal(incoming.gameweekPoints[2], 0); // Man City blank in GW5
      assert.equal(gain, round2(incoming.horizonPoints - out.horizonPoints));
    });

    it('skips players the budget can’t reach', async () => {
      withPlayers([{ ...DELAP, now_cost: 90 }]); // 0.5 + 7.3 < 9.0
      const t: TransfersResponse = (await api.transfers()).body;
      assert.deepEqual(t.single.map(moves), []);
    });

    it('rolls a small gain with 1 free transfer, but makes it when 5 are banked', async () => {
      withPlayers([DELAP]);
      const one: TransfersResponse = (await api.transfers()).body;
      const delap = one.single[0]!;
      assert.equal(moves(delap), 'N.Jackson>Delap');
      assert.ok(delap.gain > 0 && delap.gain < one.rules.savedTransferValue, String(delap.gain));
      // Using it means 1 free transfer next week instead of 2.
      assert.equal(delap.score, round2(delap.netGain - one.rules.savedTransferValue));
      assert.deepEqual(one.recommended.moves, []);

      withPlayers([DELAP]);
      withHistory([0, 0, 0, 0, 0, 0]);
      const five: TransfersResponse = (await api.transfers({ refresh: true })).body;
      assert.equal(five.freeTransfers, 5);
      assert.equal(moves(five.recommended), 'N.Jackson>Delap');
      assert.equal(five.recommended.score, five.recommended.netGain); // a 6th couldn't be banked
      assert.equal(five.recommended.freeTransfersNext, 5);
    });

    it('charges 4 points for the second transfer, and only suggests it when the gain beats that', async () => {
      withPlayers([DELAP, DIAS]);
      const small: TransfersResponse = (await api.transfers()).body;
      const pair = small.double[0]!;
      assert.equal(moves(pair), 'Gvardiol>Dias,N.Jackson>Delap');
      assert.equal(pair.hitCost, 4);
      assert.equal(pair.netGain, round2(pair.gain - 4));
      assert.ok(pair.gain < 4);
      assert.equal(moves(small.recommended), 'Gvardiol>Dias');

      // When each move alone gains more than 4, the −4 for the second one is worth it.
      withPlayers([
        { ...DELAP, expected_goals: '9.00' },
        { ...DIAS, expected_goals: '6.00' },
      ]);
      const big: TransfersResponse = (await api.transfers({ refresh: true })).body;
      assert.deepEqual(moves(big.recommended).split(',').sort(), ['Gvardiol>Dias', 'N.Jackson>Delap']);
      for (const single of big.single.slice(0, 2)) assert.ok(single.gain > 4, moves(single));
      assert.equal(big.recommended.hitCost, 4);
      assert.ok(big.recommended.gain > 4 + big.rules.savedTransferValue);
      assert.equal(big.recommended.bankAfter, 2.8); // 0.5 + 6.0 + 7.3 − 5.5 − 5.5
    });

    it('makes two transfers without a hit when two are banked', async () => {
      withPlayers([DELAP, DIAS]);
      withHistory([0, 0]);
      const t: TransfersResponse = (await api.transfers()).body;

      assert.equal(t.freeTransfers, 2);
      assert.equal(t.double[0]!.hitCost, 0);
      assert.equal(t.double[0]!.netGain, t.double[0]!.gain);
    });

    it('only lists pairs where both moves add points', async () => {
      // Dias is a much worse defender than Gvardiol would be fit, so a pair would add nothing beyond Delap.
      withPlayers([DELAP, { ...DIAS, expected_goals: '0.00', minutes: 20, starts: 0 }], (b) => {
        const gvardiol = b.elements.find((e) => e.web_name === 'Gvardiol')!;
        Object.assign(gvardiol, { status: 'a', news: '', chance_of_playing_next_round: null, minutes: 180, starts: 2 });
      });
      const t: TransfersResponse = (await api.transfers()).body;

      assert.deepEqual(t.single.map(moves).slice(0, 1), ['N.Jackson>Delap']);
      assert.deepEqual(t.double, []);
    });
  });

  it('serves repeat requests from the SQLite cache, and rebuilds on ?refresh=true', async () => {
    const first = await api.transfers();
    const second = await api.transfers();
    assert.equal(first.body.cache.fromCache, false);
    assert.equal(second.body.cache.fromCache, true);
    assert.deepEqual(second.body.recommended, first.body.recommended);
    assert.equal((await api.transfers({ refresh: true })).body.cache.fromCache, false);
  });
});
