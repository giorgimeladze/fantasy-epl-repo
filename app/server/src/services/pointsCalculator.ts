import type { FplLive, FplPicks } from '../models/fpl.js';

/**
 * Final multiplier per player for one gameweek, after automatic substitutions and
 * vice-captain promotion. The FPL picks payload holds the manager's *selection*;
 * this derives what actually scored.
 *
 * Idempotent if FPL has already applied these adjustments to `multiplier`.
 */
export function effectiveMultipliers(
  picks: FplPicks,
  minutesById: ReadonlyMap<number, number>,
  gameweekFinished: boolean,
): Map<number, number> {
  const multipliers = new Map(picks.picks.map((p) => [p.element, p.multiplier]));

  for (const sub of picks.automatic_subs) {
    multipliers.set(sub.element_out, 0);
    multipliers.set(sub.element_in, 1);
  }

  const captain = picks.picks.find((p) => p.is_captain);
  const vice = picks.picks.find((p) => p.is_vice_captain);
  if (captain && vice && captain.multiplier > 1) {
    const captainDidNotPlay =
      multipliers.get(captain.element) === 0 ||
      (gameweekFinished && (minutesById.get(captain.element) ?? 0) === 0);
    const vicePlays = (multipliers.get(vice.element) ?? 0) > 0;
    if (captainDidNotPlay && vicePlays) {
      multipliers.set(captain.element, Math.min(multipliers.get(captain.element) ?? 0, 1));
      multipliers.set(vice.element, captain.multiplier);
    }
  }

  return multipliers;
}

export interface GameweekData {
  gameweek: number;
  finished: boolean;
  picks: FplPicks;
  live: FplLive;
}

/** Points each player contributed to the manager across the given gameweeks. */
export function pointsContributed(gameweeks: readonly GameweekData[]): Map<number, number> {
  const totals = new Map<number, number>();

  for (const { picks, live, finished } of gameweeks) {
    const pointsById = new Map(live.elements.map((e) => [e.id, e.stats.total_points]));
    const minutesById = new Map(live.elements.map((e) => [e.id, e.stats.minutes]));
    const multipliers = effectiveMultipliers(picks, minutesById, finished);

    for (const [element, multiplier] of multipliers) {
      const points = (pointsById.get(element) ?? 0) * multiplier;
      totals.set(element, (totals.get(element) ?? 0) + points);
    }
  }

  return totals;
}
