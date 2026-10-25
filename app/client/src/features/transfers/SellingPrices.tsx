import { money } from '../../lib/format.ts';
import type { TransfersResponse } from '../../types.ts';

export function SellingPrices({ data }: { data: TransfersResponse }) {
  return (
    <section>
      <h2>Selling prices</h2>
      <p className="muted">
        Estimated from your transfers: purchase price plus half of any rise, rounded down to £0.1m. Players from your
        first squad are taken at the season's starting price.
      </p>
      <div className="table-wrap">
        <table className="players">
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">Bought</th>
              <th className="num">Now</th>
              <th className="num">Sells for</th>
            </tr>
          </thead>
          <tbody>
            {data.squad.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="cell-player">
                    <strong>{s.webName}</strong>
                    <span className="muted">
                      {s.clubShortName} · {s.position}
                      {s.boughtInGameweek ? ` · bought GW${s.boughtInGameweek}` : ''}
                    </span>
                  </div>
                </td>
                <td className="num">{money(s.purchasePrice)}</td>
                <td className="num">{money(s.price)}</td>
                <td className="num">
                  <strong>{money(s.sellingPrice)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
