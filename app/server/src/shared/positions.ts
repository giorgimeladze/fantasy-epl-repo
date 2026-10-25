// Pure position and availability helpers shared by every feature.
import type { Position } from '../team/models.js';

export const POSITIONS: readonly Position[] = ['GK', 'DEF', 'MID', 'FWD'];

const ORDER: Record<Position, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

/** Sort comparator: goalkeepers first, forwards last. */
export const byPosition = (a: { position: Position }, b: { position: Position }): number =>
  ORDER[a.position] - ORDER[b.position];

/** FPL's short position names (`GKP` in bootstrap-static, `GK` in the past-season CSVs). */
export function positionFromCode(code: string | undefined): Position | null {
  switch (code) {
    case 'GK':
    case 'GKP':
      return 'GK';
    case 'DEF':
    case 'MID':
    case 'FWD':
      return code;
    default:
      return null;
  }
}

/** `u` (unavailable, e.g. left the club) and `n` (not in the squad) are never worth picking. */
export const isAvailable = (p: { status: string }): boolean => p.status !== 'u' && p.status !== 'n';

/** `{ GK: [...], DEF: [...], ... }`: `players` of each position, in their order. */
export function groupByPosition<T extends { position: Position }>(players: readonly T[]): Record<Position, T[]> {
  const groups = POSITIONS.map((position) => [position, players.filter((p) => p.position === position)]);
  return Object.fromEntries(groups) as Record<Position, T[]>;
}
