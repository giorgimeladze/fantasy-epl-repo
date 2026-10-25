import { useState } from 'react';
import { ProjectionTable } from '../../components/ProjectionTable.tsx';
import { Segmented } from '../../components/Segmented.tsx';
import { POSITIONS } from '../../lib/format.ts';
import type { PlayerProjection, Position } from '../../types.ts';

const POSITION_OPTIONS = POSITIONS.map((p) => ({ value: p, label: p }));

/** Low-ownership players outside the squad with the most predicted points, per position. */
export function Differentials({ differentials }: { differentials: Record<Position, PlayerProjection[]> }) {
  const [position, setPosition] = useState<Position>('MID');
  const players = differentials[position];
  return (
    <section>
      <h2>Differentials</h2>
      <p className="muted">
        Players you don't own, picked by under 10% of managers, with the most predicted points over the next
        gameweeks. Click a player for the breakdown.
      </p>
      <div className="h2h-controls">
        <Segmented label="Position" options={POSITION_OPTIONS} value={position} onChange={setPosition} />
      </div>
      {players.length === 0 ? (
        <p className="muted">No differentials in this position.</p>
      ) : (
        <ProjectionTable players={players} gameweeks={players[0]!.gameweeks.map((g) => g.gameweek)} showOwnership />
      )}
    </section>
  );
}
