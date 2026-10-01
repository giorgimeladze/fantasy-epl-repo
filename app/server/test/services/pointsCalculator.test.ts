import assert from 'node:assert/strict';
import type { FplLive, FplPick, FplPicks } from '../../src/models/fpl.js';
import { effectiveMultipliers, pointsContributed } from '../../src/services/pointsCalculator.js';
import { loadMock } from '../helpers/mockFplApi.js';

function pick(element: number, position: number, extra: Partial<FplPick> = {}): FplPick {
  return {
    element,
    position,
    multiplier: position <= 11 ? 1 : 0,
    is_captain: false,
    is_vice_captain: false,
    ...extra,
  };
}

function picksPayload(picks: FplPick[], automatic_subs: FplPicks['automatic_subs'] = []): FplPicks {
  return {
    active_chip: null,
    automatic_subs,
    entry_history: {
      event: 1,
      points: 0,
      total_points: 0,
      rank: null,
      bank: 0,
      value: 1000,
      event_transfers: 0,
      event_transfers_cost: 0,
      points_on_bench: 0,
    },
    picks,
  };
}

describe('pointsCalculator', () => {
  describe('effectiveMultipliers', () => {
    it('keeps the selection when everyone played', () => {
      const picks = picksPayload([
        pick(1, 1, { multiplier: 2, is_captain: true }),
        pick(2, 2, { is_vice_captain: true }),
        pick(3, 12),
      ]);
      const result = effectiveMultipliers(picks, new Map([[1, 90], [2, 90], [3, 90]]), true);
      assert.deepEqual([...result], [[1, 2], [2, 1], [3, 0]]);
    });

    it('applies automatic substitutions', () => {
      const picks = picksPayload([pick(1, 1), pick(2, 12)], [{ element_in: 2, element_out: 1, event: 1 }]);
      const result = effectiveMultipliers(picks, new Map([[2, 90]]), true);
      assert.equal(result.get(1), 0);
      assert.equal(result.get(2), 1);
    });

    it('promotes the vice-captain (keeping triple captain) when the captain did not play', () => {
      const picks = picksPayload([
        pick(1, 1, { multiplier: 3, is_captain: true }),
        pick(2, 2, { is_vice_captain: true }),
      ]);
      const result = effectiveMultipliers(picks, new Map([[1, 0], [2, 90]]), true);
      assert.equal(result.get(1), 1);
      assert.equal(result.get(2), 3);
    });

    it('promotes the vice-captain when the captain was auto-subbed out', () => {
      const picks = picksPayload(
        [pick(1, 1, { multiplier: 2, is_captain: true }), pick(2, 2, { is_vice_captain: true }), pick(3, 12)],
        [{ element_in: 3, element_out: 1, event: 1 }],
      );
      const result = effectiveMultipliers(picks, new Map([[2, 90], [3, 90]]), true);
      assert.equal(result.get(1), 0);
      assert.equal(result.get(2), 2);
      assert.equal(result.get(3), 1);
    });

    it('does not promote the vice-captain while the gameweek is in progress', () => {
      const picks = picksPayload([
        pick(1, 1, { multiplier: 2, is_captain: true }),
        pick(2, 2, { is_vice_captain: true }),
      ]);
      const result = effectiveMultipliers(picks, new Map([[1, 0], [2, 90]]), false);
      assert.equal(result.get(1), 2);
      assert.equal(result.get(2), 1);
    });

    it('counts bench players under Bench Boost', () => {
      const picks = { ...picksPayload([pick(1, 1), pick(2, 12, { multiplier: 1 })]), active_chip: 'bboost' };
      const result = effectiveMultipliers(picks, new Map([[1, 90], [2, 90]]), true);
      assert.equal(result.get(2), 1);
    });
  });

  describe('pointsContributed', () => {
    it('sums multiplied points across the mocked gameweeks', () => {
      const totals = pointsContributed([
        { gameweek: 1, finished: true, picks: loadMock<FplPicks>('picks-gw1.json'), live: loadMock<FplLive>('live-gw1.json') },
        { gameweek: 2, finished: false, picks: loadMock<FplPicks>('picks-gw2.json'), live: loadMock<FplLive>('live-gw2.json') },
      ]);

      assert.equal(totals.get(9), 29, 'Salah: 12×2 (GW1 captain) + 5');
      assert.equal(totals.get(13), 35, 'Haaland: 9 + 13×2 (GW2 captain)');
      assert.equal(totals.get(7), 2, 'Colwill: auto-subbed in for GW1 only');
      assert.equal(totals.get(6), 2, 'Gvardiol: auto-subbed out in GW1');
      assert.equal(totals.get(16), 2, 'Isak: sold after GW1');
      assert.equal(totals.get(15), 0, 'Havertz: always on the bench');
    });
  });
});
