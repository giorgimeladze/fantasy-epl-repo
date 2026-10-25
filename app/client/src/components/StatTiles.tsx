import type { ReactNode } from 'react';

export interface StatTile {
  label: ReactNode;
  value: ReactNode;
  /** `gain` / `loss` colour the value. */
  className?: string;
}

/** The row of headline numbers at the top of a page. */
export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <dl className="stat-tiles">
      {tiles.map((tile, i) => (
        <div key={i} className="stat-tile">
          <dt>{tile.label}</dt>
          <dd className={tile.className}>{tile.value}</dd>
        </div>
      ))}
    </dl>
  );
}
