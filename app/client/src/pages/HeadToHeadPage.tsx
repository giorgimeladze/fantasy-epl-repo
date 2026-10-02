import { useMemo, useState } from 'react';
import { api } from '../api.ts';
import { HeadToHeadCard } from '../components/HeadToHeadCard.tsx';
import { PageToolbar } from '../components/PageToolbar.tsx';
import { useApiResource } from '../hooks/useApiResource.ts';
import type { PlayerHeadToHead } from '../types.ts';

type Filter = 'all' | 'starters' | 'bench';
type Sort = 'squad' | 'best' | 'worst';

const SORTERS: Record<Sort, (a: PlayerHeadToHead, b: PlayerHeadToHead) => number> = {
  squad: (a, b) => a.player.pickPosition - b.player.pickPosition,
  best: (a, b) => byRecord(a, b, -1),
  worst: (a, b) => byRecord(a, b, 1),
};

/** Orders by average points; players with no history always go last. */
function byRecord(a: PlayerHeadToHead, b: PlayerHeadToHead, direction: 1 | -1): number {
  const aHas = a.summary.matches > 0;
  const bHas = b.summary.matches > 0;
  if (aHas !== bHas) return aHas ? -1 : 1;
  return (a.summary.averagePoints - b.summary.averagePoints) * direction || a.player.pickPosition - b.player.pickPosition;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

interface Props {
  onUnauthorized: () => void;
}

export function HeadToHeadPage({ onUnauthorized }: Props) {
  const { data, error, loading, reload } = useApiResource(api.getHeadToHead, onUnauthorized);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('squad');

  const players = useMemo(() => {
    if (!data) return [];
    return data.players
      .filter((p) => filter === 'all' || (filter === 'starters') === p.player.isStarter)
      .sort(SORTERS[sort]);
  }, [data, filter, sort]);

  return (
    <>
      <PageToolbar title="Head-to-head" loading={loading} onRefresh={() => void reload(true)} />
      <p className="muted intro">
        Each player's last 4 appearances against their next opponent: how they played, and what earned or cost
        them points.
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && loading && (
        <p className="muted">
          Loading match history… The first load downloads past seasons and can take a few seconds.
        </p>
      )}

      {data && (
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
                <option value="best">Best record first</option>
                <option value="worst">Worst record first</option>
              </select>
            </label>
          </div>

          <p className="muted updated">
            Seasons covered: {data.seasonsCovered.join(', ')} · fetched at {time(data.cache.fetchedAt)}
            {data.cache.fromCache ? ' (cached)' : ''}
          </p>

          <div className="h2h-list">
            {players.map((p) => (
              <HeadToHeadCard key={p.player.id} data={p} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
