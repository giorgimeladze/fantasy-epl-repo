import type { CacheInfo, GameweekInfo, ManagerSummary } from '../types.ts';

const CHIP_NAMES: Record<string, string> = {
  bboost: 'Bench Boost',
  '3xc': 'Triple Captain',
  freehit: 'Free Hit',
  wildcard: 'Wildcard',
};

interface Props {
  manager: ManagerSummary;
  gameweek: GameweekInfo;
  cache: CacheInfo;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function ManagerHeader({ manager, gameweek, cache }: Props) {
  const stats: Array<[label: string, value: string]> = [
    [`${gameweek.name} points`, String(manager.gameweekPoints)],
    ['Total points', manager.overallPoints.toLocaleString()],
    ['Overall rank', manager.overallRank?.toLocaleString() ?? '—'],
    ['Team value', `£${manager.teamValue.toFixed(1)}m`],
    ['In the bank', `£${manager.bank.toFixed(1)}m`],
    ['Points on bench', String(manager.pointsOnBench)],
  ];

  return (
    <section className="manager">
      <div>
        <h2 className="team-name">{manager.teamName}</h2>
        <p className="muted">
          {manager.managerName} · {gameweek.name} {gameweek.finished ? '(finished)' : '(in progress)'}
          {manager.activeChip && (
            <span className="chip">{CHIP_NAMES[manager.activeChip] ?? manager.activeChip}</span>
          )}
          {manager.transfersCost > 0 && <span className="chip hit">−{manager.transfersCost} hit</span>}
        </p>
        <p className="muted updated">
          Data fetched from FPL at {time(cache.fetchedAt)}
          {cache.fromCache ? ' (cached)' : ''} · next load after {time(cache.expiresAt)} fetches fresh data
        </p>
      </div>
      <dl className="stat-tiles">
        {stats.map(([label, value]) => (
          <div key={label} className="stat-tile">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
