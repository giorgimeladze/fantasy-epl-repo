import { fixed, money, signed } from '../../lib/format.ts';
import type { RotationPair } from '../../types.ts';

interface Props {
  pairs: RotationPair[];
  unit: string;
  gameweeks: number[];
}

/** Club pairs that cover each other: who to play each gameweek and what rotating adds. */
export function RotationTable({ pairs, unit, gameweeks }: Props) {
  if (pairs.length === 0) return <p className="muted">No pair rotates well (or fits the budget) in these gameweeks.</p>;
  return (
    <div className="table-wrap">
      <table className="players">
        <thead>
          <tr>
            <th>Pair</th>
            {gameweeks.map((gw) => (
              <th key={gw} className="num">
                GW{gw}
              </th>
            ))}
            <th className="num" title={`Sum of the better club each week (${unit})`}>
              Total
            </th>
            <th className="num" title="What rotating adds over the better club alone">
              Adds
            </th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((pair) => (
            <tr key={pair.clubs.join('+')}>
              <td>
                <div className="cell-player">
                  <strong>{pair.clubs.join(' + ')}</strong>
                  {pair.players.length > 0 && (
                    <span className="muted">
                      {pair.players.map((p) => p.webName).join(' + ')} · {money(pair.price)}
                    </span>
                  )}
                </div>
              </td>
              {pair.weeks.map((w) => (
                <td key={w.gameweek} className="num" title={`${w.pick} ${w.value} vs ${w.other}`}>
                  <strong>{w.pick}</strong>
                  <div className="muted">{fixed(w.value)}</div>
                </td>
              ))}
              <td className="num">
                <strong>{fixed(pair.total)}</strong>
              </td>
              <td className="num">{signed(pair.total - pair.bestSingle)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
