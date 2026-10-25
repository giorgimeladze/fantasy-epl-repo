import { useMemo, useState } from 'react';
import { api } from '../../api.ts';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { PageToolbar } from '../../components/PageToolbar.tsx';
import { Segmented } from '../../components/Segmented.tsx';
import { ProjectionTable } from '../../components/ProjectionTable.tsx';
import { useApiResource } from '../../hooks/useApiResource.ts';
import { fetchedAt, gameweekRange, POSITIONS } from '../../lib/format.ts';
import type { PlayerProjection, Position } from '../../types.ts';
import type { PageProps } from '../../routes.ts';

type Filter = 'all' | 'starters' | 'bench';
type Sort = 'squad' | 'next' | 'total';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All 15' },
  { value: 'starters', label: 'Starting XI' },
  { value: 'bench', label: 'Bench' },
];

const SORTERS: Record<Sort, (a: PlayerProjection, b: PlayerProjection) => number> = {
  squad: (a, b) => (a.pickPosition ?? 0) - (b.pickPosition ?? 0),
  next: (a, b) => b.nextGameweekPoints - a.nextGameweekPoints,
  total: (a, b) => b.horizonPoints - a.horizonPoints,
};

const POSITION_OPTIONS = POSITIONS.map((p) => ({ value: p, label: p }));

export function PredictionsPage({ onUnauthorized }: PageProps) {
  const { data, error, loading, reload } = useApiResource(api.getProjections, onUnauthorized);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('squad');
  const [position, setPosition] = useState<Position>('MID');

  const squad = useMemo(() => {
    if (!data) return [];
    const isStarter = (p: PlayerProjection) => p.pickPosition !== null && p.pickPosition <= 11;
    return data.squad.filter((p) => filter === 'all' || (filter === 'starters') === isStarter(p)).sort(SORTERS[sort]);
  }, [data, filter, sort]);

  const range = gameweekRange(data?.gameweeks ?? []);

  return (
    <>
      <PageToolbar title="Predictions" loading={loading} onRefresh={() => void reload(true)} />
      <p className="muted intro">
        Predicted FPL points from expected minutes, xG and xA, the opponent's strength and the chance of a clean sheet.
        FPL's own forecast for the next gameweek is shown next to it. Click a player to see where the points come from.
      </p>

      <ErrorMessage error={error} />
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
            <Segmented label="Show" options={FILTERS} value={filter} onChange={setFilter} />
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
            {range} · {fetchedAt(data.cache)}
          </p>

          <ProjectionTable players={squad} gameweeks={data.gameweeks} />

          <section>
            <h2>Top predicted players, {range}</h2>
            <div className="h2h-controls">
              <Segmented label="Position" options={POSITION_OPTIONS} value={position} onChange={setPosition} />
              <span className="muted updated">★ in your squad</span>
            </div>
            <ProjectionTable players={data.top[position]} gameweeks={data.gameweeks} markSquad />
          </section>
        </>
      )}
    </>
  );
}
