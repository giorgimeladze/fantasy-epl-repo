import type { LineupPlayer } from '../../types.ts';

/** The reasons behind a player's prediction, on one line. */
export function PlayerWhy({ player }: { player: LineupPlayer }) {
  return <span className="reasons">{player.reasons.join(' · ')}</span>;
}
