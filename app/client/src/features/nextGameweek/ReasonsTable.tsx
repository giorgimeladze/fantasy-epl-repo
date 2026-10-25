import { pct, pts } from '../../lib/format.ts';
import type { NextGameweekResponse } from '../../types.ts';
import { PlayerWhy } from './PlayerWhy.tsx';

/** Every player in the best XI and bench, with points, chance to play and why. */
export function ReasonsTable({ data }: { data: NextGameweekResponse }) {
  const rows = [...data.best.starters, ...data.best.bench];
  const starters = new Set(data.best.starters.map((p) => p.id));
  return (
    <section>
      <h2>Why each player</h2>
      <div className="table-wrap">
        <table className="players">
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">Pts</th>
              <th className="num" title="Chance of playing (fitness and rotation)">
                Plays
              </th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={starters.has(p.id) ? '' : 'benched'}>
                <td>
                  <div className="cell-player">
                    <strong>
                      {p.webName}
                      {p.id === data.best.captainId && ' (C)'}
                      {p.id === data.best.viceCaptainId && ' (V)'}
                    </strong>
                    <span className="muted">
                      {p.clubShortName} · {p.position}
                      {!starters.has(p.id) && ' · bench'}
                    </span>
                  </div>
                </td>
                <td className="num">{pts(p.points)}</td>
                <td className="num">{pct(p.playChance)}</td>
                <td>
                  <PlayerWhy player={p} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
