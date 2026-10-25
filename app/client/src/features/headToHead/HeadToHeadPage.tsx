import { useMemo, useState } from 'react';
import { api } from '../../api.ts';
import { HeadToHeadCard } from './HeadToHeadCard.tsx';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { PageToolbar } from '../../components/PageToolbar.tsx';
import { Segmented } from '../../components/Segmented.tsx';
import { PlayerScout } from './PlayerScout.tsx';
import { useApiResource } from '../../hooks/useApiResource.ts';
import { fetchedAt } from '../../lib/format.ts';
import type { PlayerHeadToHead } from '../../types.ts';
import type { PageProps } from '../../routes.ts';

type Filter = 'all' | 'starters' | 'bench';
type Sort = 'squad' | 'best' | 'worst';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: 'All 15' },
  { value: 'starters', label: 'Starting XI' },
  { value: 'bench', label: 'Bench' },
];

const SORTERS: Record<Sort, (a: PlayerHeadToHead, b: PlayerHeadToHead) => number> = {
  squad: (a, b) => (a.player.pickPosition ?? 0) - (b.player.pickPosition ?? 0),
  best: (a, b) => byRecord(a, b, -1),
  worst: (a, b) => byRecord(a, b, 1),
};

/** Orders by average points; players with no history always go last. */
function byRecord(a: PlayerHeadToHead, b: PlayerHeadToHead, direction: 1 | -1): number {
  const aHas = a.summary.matches > 0;
  const bHas = b.summary.matches > 0;
  if (aHas !== bHas) return aHas ? -1 : 1;
  return (a.summary.averagePoints - b.summary.averagePoints) * direction || SORTERS.squad(a, b);
}

export function HeadToHeadPage({ onUnauthorized }: PageProps) {
  const { data, error, loading, reload } = useApiResource(api.getHeadToHead, onUnauthorized);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('squad');

  const players = useMemo(() => {
    if (!data) return [];
    return data.players
      .filter((p) => filter === 'all' || (filter === 'starters') === p.player.isStarter)
      .sort(SORTERS[sort]);
  }, [data, filter, sort]);

  const squadIds = useMemo(() => new Set(data?.players.map((p) => p.player.id) ?? []), [data]);

  return (
    <>
      <PageToolbar title="Head-to-head" loading={loading} onRefresh={() => void reload(true)} />
      <p className="muted intro">
        Each player's last 4 appearances against their next opponent: how they played, and what earned or cost
        them points.
      </p>

      <ErrorMessage error={error} />
      {!data && loading && (
        <p className="muted">
          Loading match history… The first load downloads past seasons and can take a few seconds.
        </p>
      )}

      {data && (
        <>
          <div className="h2h-controls">
            <Segmented label="Show" options={FILTERS} value={filter} onChange={setFilter} />
            <label className="sort">
              Sort
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                <option value="squad">Squad order</option>
                <option value="best">Best record first</option>
                <option value="worst">Worst record first</option>
              </select>
            </label>
          </div>

          <p className="muted updated">
            Seasons covered: {data.seasonsCovered.join(', ')} · {fetchedAt(data.cache)}
          </p>

          <div className="h2h-list">
            {players.map((p) => (
              <HeadToHeadCard key={p.player.id} data={p} />
            ))}
          </div>
        </>
      )}

      <PlayerScout squadIds={squadIds} onUnauthorized={onUnauthorized} />
    </>
  );
}
