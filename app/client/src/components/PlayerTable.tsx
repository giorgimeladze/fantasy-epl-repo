import { useMemo, useState } from 'react';
import type { PlayerView } from '../types.ts';
import { FixtureChip } from './FixtureChip.tsx';

type NumericKey = {
  [K in keyof PlayerView]: PlayerView[K] extends number ? K : never;
}[keyof PlayerView];

interface Column {
  key: NumericKey;
  label: string;
  title: string;
  format?: (value: number) => string;
}

const COLUMNS: Column[] = [
  { key: 'price', label: '£', title: 'Price (£m)', format: (v) => v.toFixed(1) },
  { key: 'form', label: 'Form', title: 'FPL form (avg pts last 30 days)', format: (v) => v.toFixed(1) },
  { key: 'gameweekPoints', label: 'GW', title: 'Points this gameweek' },
  { key: 'pointsForMe', label: 'For me', title: 'Points this player has earned for your team this season' },
  { key: 'totalPoints', label: 'Total', title: 'Season total points' },
  { key: 'pointsPerGame', label: 'PPG', title: 'Points per game', format: (v) => v.toFixed(1) },
  { key: 'minutes', label: 'Mins', title: 'Minutes played' },
  { key: 'goals', label: 'G', title: 'Goals' },
  { key: 'assists', label: 'A', title: 'Assists' },
  { key: 'cleanSheets', label: 'CS', title: 'Clean sheets' },
  { key: 'bonus', label: 'Bonus', title: 'Bonus points' },
  { key: 'expectedGoals', label: 'xG', title: 'Expected goals', format: (v) => v.toFixed(2) },
  { key: 'expectedAssists', label: 'xA', title: 'Expected assists', format: (v) => v.toFixed(2) },
  { key: 'ictIndex', label: 'ICT', title: 'ICT index', format: (v) => v.toFixed(1) },
  { key: 'selectedByPercent', label: 'Sel %', title: 'Selected by % of managers', format: (v) => v.toFixed(1) },
];

export function PlayerTable({ players }: { players: PlayerView[] }) {
  const [sortKey, setSortKey] = useState<NumericKey>('pickPosition');
  const [descending, setDescending] = useState(false);

  const sorted = useMemo(() => {
    const dir = descending ? -1 : 1;
    return [...players].sort((a, b) => (a[sortKey] - b[sortKey]) * dir);
  }, [players, sortKey, descending]);

  function sortBy(key: NumericKey) {
    if (key === sortKey) {
      setDescending(!descending);
    } else {
      setSortKey(key);
      setDescending(true);
    }
  }

  const arrow = (key: NumericKey) => (key === sortKey ? (descending ? ' ▼' : ' ▲') : '');

  return (
    <section>
      <h2>Squad statistics</h2>
      <div className="table-wrap">
        <table className="players">
          <thead>
            <tr>
              <th>
                <button className="th-sort" onClick={() => sortBy('pickPosition')}>
                  Player{arrow('pickPosition')}
                </button>
              </th>
              {COLUMNS.map((c) => (
                <th key={c.key} title={c.title} className="num">
                  <button className="th-sort" onClick={() => sortBy(c.key)}>
                    {c.label}
                    {arrow(c.key)}
                  </button>
                </th>
              ))}
              <th>Next fixtures</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id} className={p.isStarter ? '' : 'benched'}>
                <td>
                  <div className="cell-player">
                    <strong>
                      {p.webName}
                      {p.isCaptain && ' (C)'}
                      {p.isViceCaptain && ' (V)'}
                    </strong>
                    <span className="muted">
                      {p.club.shortName} · {p.position}
                      {!p.isStarter && ' · bench'}
                    </span>
                    {p.news && <span className="news">{p.news}</span>}
                  </div>
                </td>
                {COLUMNS.map((c) => (
                  <td key={c.key} className="num">
                    {c.format ? c.format(p[c.key]) : p[c.key]}
                  </td>
                ))}
                <td>
                  <div className="fixtures">
                    {p.nextFixtures.map((f) => (
                      <FixtureChip key={`${f.gameweek}-${f.opponent}`} fixture={f} />
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
