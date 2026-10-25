// Pure: the best 0, 1 or 2 transfers for the planning horizon, checked exhaustively over a pruned
// list of candidates (no solver needed at this size: ~100 pairs out × ~900 pairs in).
//
// A squad is scored per gameweek like the Next GW page scores a lineup: starters + armband +
// expected automatic substitutions. To keep the search fast the XI is picked greedily (best
// keeper, the formation minimums 3 DEF / 2 MID / 1 FWD, then the 4 best other outfielders). With a
// 2-5-5-3 squad that is the XI with the most predicted points, but not always the one the full
// search on the Next GW page picks (it also weighs captaincy and autosubs).
import type { Position } from '../team/models.js';
import { autosubPoints, bestCaptaincy, type Candidate } from '../nextGameweek/lineupOptimizer.js';
import { freeTransfersAfter } from './freeTransfers.js';

export interface SquadPlayer {
  id: number;
  position: Position;
  club: string;
  /** Tenths of £m: the selling price for squad players, the buying price for candidates. */
  price: number;
  /** One per gameweek in the horizon; points already weighted by playChance. */
  gameweeks: ReadonlyArray<{ points: number; playChance: number }>;
}

export interface TransferRules {
  bank: number; // tenths of £m
  freeTransfers: number;
  maxFreeTransfers: number;
  maxTransfers: number; // 0–2 are searched
  hitCost: number;
  maxPerClub: number;
  savedTransferValue: number;
  optionsShown: number;
}

export interface TransferMove {
  outId: number;
  inId: number;
}

export interface TransferPlan {
  moves: TransferMove[]; // empty = save the transfer
  perGameweek: number[]; // the squad's predicted points per gameweek after the moves
  gain: number; // over the horizon, against keeping the squad
  hitCost: number;
  netGain: number; // gain − hitCost
  freeTransfersNext: number; // free transfers the following gameweek
  bankAfter: number; // tenths of £m
  /** netGain minus the value of the banked transfers given up. The recommendation is the highest. */
  score: number;
}

export interface TransferSearchResult {
  baseline: number[]; // the current squad per gameweek
  save: TransferPlan;
  single: TransferPlan[]; // best first
  double: TransferPlan[];
  recommended: TransferPlan;
}

const EPSILON = 1e-9;
// A candidate is skipped when this many others in the position cost no more and score more.
const DOMINATED_BY = 3;

const horizon = (p: SquadPlayer) => p.gameweeks.reduce((sum, g) => sum + g.points, 0);
const byPoints = (a: Candidate, b: Candidate) => b.points - a.points || a.id - b.id;

/** Predicted points of the squad's best XI in one gameweek, with armband and autosubs. */
export function squadGameweekPoints(squad: readonly Candidate[]): number {
  const sorted = [...squad].sort(byPoints);
  const keepers = sorted.filter((c) => c.position === 'GK');
  const keeper = keepers[0];
  if (!keeper) throw new Error('A squad needs a goalkeeper');

  const minimums: Record<Position, number> = { GK: 0, DEF: 3, MID: 2, FWD: 1 };
  const starters: Candidate[] = [keeper];
  const rest: Candidate[] = [];
  for (const c of sorted) {
    if (c.position === 'GK') continue;
    if (minimums[c.position] > 0) {
      minimums[c.position] -= 1;
      starters.push(c);
    } else {
      rest.push(c);
    }
  }
  starters.push(...rest.splice(0, 11 - starters.length));
  const bench = [...keepers.slice(1), ...rest];

  const startersPoints = starters.reduce((sum, c) => sum + c.points, 0);
  return startersPoints + bestCaptaincy(starters).points + autosubPoints(starters, bench);
}

// Built once per player: the search scores ~100k squads.
const candidateCache = new WeakMap<SquadPlayer, Candidate[]>();
function candidatesOf(p: SquadPlayer): Candidate[] {
  let candidates = candidateCache.get(p);
  if (!candidates) {
    candidates = p.gameweeks.map((g) => ({ id: p.id, position: p.position, points: g.points, playChance: g.playChance }));
    candidateCache.set(p, candidates);
  }
  return candidates;
}

function squadPoints(squad: readonly SquadPlayer[], weeks: number): number[] {
  const candidates = squad.map(candidatesOf);
  return Array.from({ length: weeks }, (_, gw) => squadGameweekPoints(candidates.map((c) => c[gw]!)));
}

/**
 * Players worth considering for buying, per position: not in the squad, affordable with the most
 * money a sale could free, not clearly beaten (on cost and points) by several others, then the
 * best `perPosition` by predicted points over the horizon.
 */
export function candidatePool(
  players: readonly SquadPlayer[],
  squad: readonly SquadPlayer[],
  maxBudget: number,
  perPosition: number,
): Map<Position, SquadPlayer[]> {
  const owned = new Set(squad.map((p) => p.id));
  const pool = new Map<Position, SquadPlayer[]>();
  for (const position of ['GK', 'DEF', 'MID', 'FWD'] as const) {
    const options = players
      .filter((p) => p.position === position && !owned.has(p.id) && p.price <= maxBudget)
      .map((p) => ({ player: p, points: horizon(p) }))
      .sort((a, b) => b.points - a.points || a.player.price - b.player.price || a.player.id - b.player.id);
    const kept = options.filter(
      (o, i) => options.slice(0, i).filter((better) => better.player.price <= o.player.price).length < DOMINATED_BY,
    );
    pool.set(
      position,
      kept.slice(0, perPosition).map((o) => o.player),
    );
  }
  return pool;
}

function* pairs<T>(items: readonly T[]): Generator<[T, T]> {
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) yield [items[i]!, items[j]!];
}

export function searchTransfers(
  squad: readonly SquadPlayer[],
  pool: ReadonlyMap<Position, readonly SquadPlayer[]>,
  rules: TransferRules,
): TransferSearchResult {
  const weeks = squad[0]?.gameweeks.length ?? 0;
  const baseline = squadPoints(squad, weeks);
  const baselineTotal = baseline.reduce((a, b) => a + b, 0);
  const clubCounts = new Map<string, number>();
  for (const p of squad) clubCounts.set(p.club, (clubCounts.get(p.club) ?? 0) + 1);
  const savedNext = freeTransfersAfter(rules.freeTransfers, 0, rules.maxFreeTransfers);

  function plan(outs: readonly SquadPlayer[], ins: readonly SquadPlayer[]): TransferPlan | null {
    const bankAfter = rules.bank + outs.reduce((s, p) => s + p.price, 0) - ins.reduce((s, p) => s + p.price, 0);
    if (bankAfter < 0) return null;
    // Only the clubs of incoming players can go over the limit.
    for (const p of ins) {
      const after =
        (clubCounts.get(p.club) ?? 0) +
        ins.filter((q) => q.club === p.club).length -
        outs.filter((q) => q.club === p.club).length;
      if (after > rules.maxPerClub) return null;
    }

    const outIds = new Set(outs.map((p) => p.id));
    const perGameweek = squadPoints([...squad.filter((p) => !outIds.has(p.id)), ...ins], weeks);
    const gain = perGameweek.reduce((a, b) => a + b, 0) - baselineTotal;
    const used = ins.length;
    const hitCost = rules.hitCost * Math.max(0, used - rules.freeTransfers);
    const freeTransfersNext = freeTransfersAfter(rules.freeTransfers, used, rules.maxFreeTransfers);
    const netGain = gain - hitCost;

    // Pair moves for display: the best newcomer replaces the weakest leaver in the same position;
    // the move that adds most comes first.
    const outsLeft = [...outs].sort((a, b) => horizon(a) - horizon(b));
    const moves = [...ins]
      .sort((a, b) => horizon(b) - horizon(a))
      .map((p) => {
        const out = outsLeft.splice(
          outsLeft.findIndex((o) => o.position === p.position),
          1,
        )[0]!;
        return { out, in: p };
      })
      .sort((a, b) => horizon(b.in) - horizon(b.out) - (horizon(a.in) - horizon(a.out)))
      .map((m) => ({ outId: m.out.id, inId: m.in.id }));
    return {
      moves,
      perGameweek,
      gain,
      hitCost,
      netGain,
      freeTransfersNext,
      bankAfter,
      score: netGain - rules.savedTransferValue * (savedNext - freeTransfersNext),
    };
  }

  const save = plan([], [])!;
  const better = (a: TransferPlan, b: TransferPlan) => b.score - a.score || a.moves.length - b.moves.length;

  const single: TransferPlan[] = [];
  const singleGain = new Map<string, number>();
  if (rules.maxTransfers >= 1) {
    for (const out of squad) {
      for (const candidate of pool.get(out.position) ?? []) {
        const p = plan([out], [candidate]);
        if (!p) continue;
        single.push(p);
        singleGain.set(`${out.id}>${candidate.id}`, p.gain);
      }
    }
  }

  const double: TransferPlan[] = [];
  if (rules.maxTransfers >= 2) {
    for (const [a, b] of pairs(squad)) {
      const poolA = pool.get(a.position) ?? [];
      const poolB = pool.get(b.position) ?? [];
      const ins: Array<[SquadPlayer, SquadPlayer]> = [];
      if (a.position === b.position) ins.push(...pairs(poolA));
      else for (const x of poolA) for (const y of poolB) ins.push([x, y]);

      for (const [x, y] of ins) {
        const p = plan([a, b], [x, y]);
        if (!p) continue;
        // Every move must add something beyond making the other one alone.
        const alone = Math.max(
          0,
          ...[a, b].flatMap((o) =>
            [x, y].filter((i) => i.position === o.position).map((i) => singleGain.get(`${o.id}>${i.id}`) ?? 0),
          ),
        );
        if (p.gain > alone + EPSILON) double.push(p);
      }
    }
  }

  single.sort(better);
  double.sort(better);
  const recommended = [save, single[0], double[0]]
    .filter((p): p is TransferPlan => p !== undefined)
    .reduce((best, p) => (p.score > best.score + EPSILON ? p : best));

  return {
    baseline,
    save,
    single: single.slice(0, rules.optionsShown),
    double: double.slice(0, rules.optionsShown),
    recommended,
  };
}
