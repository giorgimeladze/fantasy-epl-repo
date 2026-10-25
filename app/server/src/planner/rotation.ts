// Pure: pairs of clubs whose fixtures cover each other: each gameweek you play the better of the
// two, so a pair is worth the sum of the weekly maximum. Every pair is tried (20 × 19 / 2 = 190).
// Only real rotations count: each club must be the better one in at least `minStarts` gameweeks,
// otherwise "the best club + anyone" would top the list.
import { round2, sum } from '../shared/numbers.js';
import type { RotationPair } from './models.js';

export interface ClubSeries {
  club: string;
  values: number[]; // one per gameweek: a keeper's predicted points, or the club's expected clean sheets
}

export function bestPairs(
  series: readonly ClubSeries[],
  gameweeks: readonly number[],
  count: number,
  minStarts: number,
  allowed: (a: ClubSeries, b: ClubSeries) => boolean = () => true,
): Array<Omit<RotationPair, 'players' | 'price'>> {
  const pairs: Array<Omit<RotationPair, 'players' | 'price'>> = [];
  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      const [a, b] = [series[i]!, series[j]!];
      if (!allowed(a, b)) continue;
      const weeks = gameweeks.map((gameweek, w) => {
        const [va, vb] = [a.values[w] ?? 0, b.values[w] ?? 0];
        return va >= vb
          ? { gameweek, pick: a.club, value: round2(va), other: round2(vb) }
          : { gameweek, pick: b.club, value: round2(vb), other: round2(va) };
      });
      const starts = (club: string) => weeks.filter((w) => w.pick === club).length;
      if (Math.min(starts(a.club), starts(b.club)) < Math.min(minStarts, Math.floor(gameweeks.length / 2))) continue;
      pairs.push({
        clubs: [a.club, b.club],
        total: round2(sum(weeks.map((w) => w.value))),
        bestSingle: round2(Math.max(sum(a.values), sum(b.values))),
        weeks,
      });
    }
  }
  return pairs.sort((x, y) => y.total - x.total || x.clubs.join().localeCompare(y.clubs.join())).slice(0, count);
}
