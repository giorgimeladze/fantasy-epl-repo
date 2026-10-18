// Pure: picks the starting XI, bench order and captaincy with the most predicted points.
// Small enough to search exhaustively: a 15-man squad has ~530 legal XIs and 6 bench orders each.
import type { Position } from '../team/models.js';

export interface Candidate {
  id: number;
  position: Position;
  points: number; // predicted for the gameweek, already weighted by playChance
  playChance: number; // 0–1
}

export interface Lineup {
  starters: number[];
  bench: number[]; // backup goalkeeper first, then substitution order
  captainId: number;
  viceCaptainId: number;
}

export interface Evaluation {
  expectedPoints: number;
  startersPoints: number;
  captainPoints: number;
  autosubPoints: number;
}

export interface BestLineup {
  lineup: Lineup;
  evaluation: Evaluation;
  formations: Array<{ formation: string; expectedPoints: number }>; // best first
}

// DEF-MID-FWD; always 1 goalkeeper.
export const FORMATIONS: ReadonlyArray<readonly [number, number, number]> = [
  [3, 4, 3],
  [3, 5, 2],
  [4, 3, 3],
  [4, 4, 2],
  [4, 5, 1],
  [5, 3, 2],
  [5, 4, 1],
];

const EPSILON = 1e-9;

export function formationOf(starters: readonly Candidate[]): string {
  const count = (position: Position) => starters.filter((c) => c.position === position).length;
  return `${count('DEF')}-${count('MID')}-${count('FWD')}`;
}

/** Extra points from the armband: the captain's points again, or the vice-captain's if the captain doesn't play. */
export function captainPoints(captain: Candidate, vice: Candidate): number {
  return captain.points + (1 - captain.playChance) * vice.points;
}

/**
 * The best vice-captain for `captain`. When the captain is sure to play every vice adds the same
 * (nothing), so ties go to the highest-scoring starter: the natural cover if things change.
 */
export function bestVice(captain: Candidate, starters: readonly Candidate[]): Candidate {
  let best: Candidate | null = null;
  for (const vice of starters) {
    if (vice === captain) continue;
    if (!best) {
      best = vice;
      continue;
    }
    const diff = captainPoints(captain, vice) - captainPoints(captain, best);
    if (diff > EPSILON || (Math.abs(diff) <= EPSILON && vice.points > best.points + EPSILON)) best = vice;
  }
  if (!best) throw new Error('A lineup needs at least two starters');
  return best;
}

/** The captain / vice-captain pair among the starters that adds the most. */
export function bestCaptaincy(starters: readonly Candidate[]): { captain: Candidate; vice: Candidate; points: number } {
  let best: { captain: Candidate; vice: Candidate; points: number } | null = null;
  for (const captain of starters) {
    const vice = bestVice(captain, starters);
    const points = captainPoints(captain, vice);
    if (!best || points > best.points + EPSILON) best = { captain, vice, points };
  }
  if (!best) throw new Error('A lineup needs at least two starters');
  return best;
}

/**
 * Expected points from automatic substitutions. The backup goalkeeper covers the starting
 * goalkeeper; outfield bench players fill outfield no-shows in bench order. Players are treated
 * as independent, and formation limits on substitutions are ignored.
 */
export function autosubPoints(starters: readonly Candidate[], bench: readonly Candidate[]): number {
  let total = 0;

  const keeper = starters.find((c) => c.position === 'GK');
  const backupKeeper = bench.find((c) => c.position === 'GK');
  if (keeper && backupKeeper) total += (1 - keeper.playChance) * backupKeeper.points;

  // Chance of k outfield starters not playing (Poisson binomial).
  let vacancies = [1];
  for (const starter of starters) {
    if (starter.position === 'GK') continue;
    const miss = 1 - starter.playChance;
    const next = new Array<number>(vacancies.length + 1).fill(0);
    vacancies.forEach((p, k) => {
      next[k]! += p * (1 - miss);
      next[k + 1]! += p * miss;
    });
    vacancies = next;
  }

  for (const sub of bench) {
    if (sub.position === 'GK') continue;
    total += (1 - vacancies[0]!) * sub.points;
    // If they play, they fill one vacancy.
    const next = new Array<number>(vacancies.length).fill(0);
    vacancies.forEach((p, k) => {
      if (k === 0) {
        next[0]! += p;
      } else {
        next[k]! += p * (1 - sub.playChance);
        next[k - 1]! += p * sub.playChance;
      }
    });
    vacancies = next;
  }
  return total;
}

export function evaluate(lineup: Lineup, byId: ReadonlyMap<number, Candidate>): Evaluation {
  const get = (id: number) => {
    const c = byId.get(id);
    if (!c) throw new Error(`Unknown player ${id}`);
    return c;
  };
  const starters = lineup.starters.map(get);
  const bench = lineup.bench.map(get);
  const startersPoints = starters.reduce((sum, c) => sum + c.points, 0);
  const captain = captainPoints(get(lineup.captainId), get(lineup.viceCaptainId));
  const autosubs = autosubPoints(starters, bench);
  return {
    expectedPoints: startersPoints + captain + autosubs,
    startersPoints,
    captainPoints: captain,
    autosubPoints: autosubs,
  };
}

function* combinations<T>(items: readonly T[], k: number, start = 0): Generator<T[]> {
  if (k === 0) {
    yield [];
    return;
  }
  for (let i = start; i <= items.length - k; i++) {
    for (const rest of combinations(items, k - 1, i + 1)) yield [items[i]!, ...rest];
  }
}

function* permutations<T>(items: readonly T[]): Generator<T[]> {
  if (items.length <= 1) {
    yield [...items];
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const tail of permutations(rest)) yield [items[i]!, ...tail];
  }
}

/** Ties go to the lineup whose starters score more directly (rather than relying on autosubs). */
function better(a: Evaluation, b: Evaluation | undefined): boolean {
  if (!b) return true;
  if (a.expectedPoints > b.expectedPoints + EPSILON) return true;
  return Math.abs(a.expectedPoints - b.expectedPoints) <= EPSILON && a.startersPoints > b.startersPoints + EPSILON;
}

/** The best XI, bench order and captaincy over every legal formation. Throws if the squad can't field one. */
export function bestLineup(candidates: readonly Candidate[]): BestLineup {
  const byPoints = (a: Candidate, b: Candidate) => b.points - a.points || a.id - b.id;
  const of = (position: Position) => candidates.filter((c) => c.position === position).sort(byPoints);
  const keepers = of('GK');
  const [defenders, midfielders, forwards] = [of('DEF'), of('MID'), of('FWD')];

  let best: { lineup: Lineup; evaluation: Evaluation } | undefined;
  const formations: BestLineup['formations'] = [];

  for (const [d, m, f] of FORMATIONS) {
    let bestInFormation: Evaluation | undefined;
    for (const keeper of keepers) {
      for (const defs of combinations(defenders, d)) {
        for (const mids of combinations(midfielders, m)) {
          for (const fwds of combinations(forwards, f)) {
            const starters = [keeper, ...defs, ...mids, ...fwds];
            const chosen = new Set(starters);
            const rest = candidates.filter((c) => !chosen.has(c));
            const backupKeepers = rest.filter((c) => c.position === 'GK');
            const outfield = rest.filter((c) => c.position !== 'GK').sort(byPoints);
            const orders = outfield.length <= 4 ? permutations(outfield) : [outfield];
            const captaincy = bestCaptaincy(starters);
            const startersPoints = starters.reduce((sum, c) => sum + c.points, 0);

            for (const order of orders) {
              const bench = [...backupKeepers, ...order];
              const autosubs = autosubPoints(starters, bench);
              const evaluation: Evaluation = {
                expectedPoints: startersPoints + captaincy.points + autosubs,
                startersPoints,
                captainPoints: captaincy.points,
                autosubPoints: autosubs,
              };
              if (better(evaluation, bestInFormation)) bestInFormation = evaluation;
              if (better(evaluation, best?.evaluation)) {
                best = {
                  evaluation,
                  lineup: {
                    starters: starters.map((c) => c.id),
                    bench: bench.map((c) => c.id),
                    captainId: captaincy.captain.id,
                    viceCaptainId: captaincy.vice.id,
                  },
                };
              }
            }
          }
        }
      }
    }
    if (bestInFormation)
      formations.push({ formation: `${d}-${m}-${f}`, expectedPoints: bestInFormation.expectedPoints });
  }

  if (!best) throw new Error('The squad cannot field a legal starting XI');
  formations.sort((a, b) => b.expectedPoints - a.expectedPoints);
  return { ...best, formations };
}

/** Starters to swap: each player coming in is paired with one going out, same position first. */
export function lineupChanges(
  current: readonly number[],
  best: readonly number[],
  byId: ReadonlyMap<number, Candidate>,
): Array<{ in: Candidate; out: Candidate }> {
  const now = new Set(current);
  const next = new Set(best);
  const ins = best
    .filter((id) => !now.has(id))
    .map((id) => byId.get(id)!)
    .sort((a, b) => b.points - a.points);
  const outs = current
    .filter((id) => !next.has(id))
    .map((id) => byId.get(id)!)
    .sort((a, b) => a.points - b.points);

  // Like-for-like swaps first, so a goalkeeper always replaces a goalkeeper; then formation changes.
  const pairs = new Map<Candidate, Candidate>();
  for (const player of ins) {
    const index = outs.findIndex((o) => o.position === player.position);
    if (index >= 0) pairs.set(player, outs.splice(index, 1)[0]!);
  }
  for (const player of ins) {
    if (!pairs.has(player)) pairs.set(player, outs.shift()!);
  }
  return ins.map((player) => ({ in: player, out: pairs.get(player)! }));
}
