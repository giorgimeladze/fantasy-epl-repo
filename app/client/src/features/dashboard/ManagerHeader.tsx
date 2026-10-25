import { StatTiles } from '../../components/StatTiles.tsx';
import { CHIP_NAMES, money, time } from '../../lib/format.ts';
import type { CacheInfo, GameweekInfo, ManagerSummary } from '../../types.ts';

interface Props {
  manager: ManagerSummary;
  gameweek: GameweekInfo;
  cache: CacheInfo;
}

export function ManagerHeader({ manager, gameweek, cache }: Props) {
  const tiles = [
    { label: `${gameweek.name} points`, value: manager.gameweekPoints },
    { label: 'Total points', value: manager.overallPoints.toLocaleString() },
    { label: 'Overall rank', value: manager.overallRank?.toLocaleString() ?? '—' },
    { label: 'Team value', value: money(manager.teamValue) },
    { label: 'In the bank', value: money(manager.bank) },
    { label: 'Points on bench', value: manager.pointsOnBench },
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
      <StatTiles tiles={tiles} />
    </section>
  );
}
