import { useMemo, useState } from 'react';
import { api } from '../api.ts';
import { PageToolbar } from '../components/PageToolbar.tsx';
import { ProjectionTable } from '../components/ProjectionTable.tsx';
import { useApiResource } from '../hooks/useApiResource.ts';
import type { PlayerProjection, Position } from '../types.ts';

type Filter = 'all' | 'starters' | 'bench';
type Sort = 'squad' | 'next' | 'total';

const SORTERS: Record<Sort, (a: PlayerProjection, b: PlayerProjection) => number> = {
  squad: (a, b) => (a.pickPosition ?? 0) - (b.pickPosition ?? 0),
  next: (a, b) => b.nextGameweekPoints - a.nextGameweekPoints,
  total: (a, b) => b.horizonPoints - a.horizonPoints,
};

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

interface Props {
  onUnauthorized: () => void;
}

export function PredictionsPage({ onUnauthorized }: Props) {
  const { data, error, loading, reload } = useApiResource(api.getProjections, onUnauthorized);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('squad');
  const [position, setPosition] = useState<Position>('MID');

  const squad = useMemo(() => {
    if (!data) return [];
    return data.squad
      .filter((p) => filter === 'all' || (filter === 'starters') === (p.pickPosition !== null && p.pickPosition <= 11))
      .sort(SORTERS[sort]);
  }, [data, filter, sort]);

  const range = data && data.gameweeks.length > 0 ? `GW${data.gameweeks[0]}–${data.gameweeks.at(-1)}` : '';

  return (
    <>
      <PageToolbar title="Predictions" loading={loading} onRefresh={() => void reload(true)} />
      <p className="muted intro">
        Predicted FPL points from expected minutes, xG and xA, the opponent's strength and the chance of a clean sheet.
        FPL's own forecast for the next gameweek is shown next to it. Click a player to see where the points come from.
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && loading && (
        <p className="muted">
          Working out predictions… The first load downloads past seasons and can take a few seconds.
        </p>
      )}

      {data && data.gameweeks.length === 0 && (
        <p className="muted">There are no gameweeks left to predict this season.</p>
      )}

      {data && data.gameweeks.length > 0 && (
        <>
          <div className="h2h-controls">
            <div className="segmented" role="group" aria-label="Show">
              {(['all', 'starters', 'bench'] as const).map((f) => (
                <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All 15' : f === 'starters' ? 'Starting XI' : 'Bench'}
                </button>
              ))}
            </div>
            <label className="sort">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="squad">Squad order</option>
                <option value="next">Next gameweek</option>
                <option value="total">{range} total</option>
              </select>
            </label>
          </div>

          <p className="muted updated">
            {range} · fetched at {time(data.cache.fetchedAt)}
            {data.cache.fromCache ? ' (cached)' : ''}
          </p>

          <ProjectionTable players={squad} gameweeks={data.gameweeks} />

          <section>
            <h2>Top predicted players, {range}</h2>
            <div className="h2h-controls">
              <div className="segmented" role="group" aria-label="Position">
                {POSITIONS.map((p) => (
                  <button key={p} className={position === p ? 'active' : ''} onClick={() => setPosition(p)}>
                    {p}
                  </button>
                ))}
              </div>
              <span className="muted updated">★ in your squad</span>
            </div>
            <ProjectionTable players={data.top[position]} gameweeks={data.gameweeks} markSquad />
          </section>
        </>
      )}
    </>
  );
}
