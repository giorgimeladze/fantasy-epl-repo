import type { PriceHint } from '../types.ts';

const when = (updatesAway: number) => (updatesAway === 0 ? 'tonight' : `in ${updatesAway + 1} nights`);

function describe(hint: PriceHint): string {
  const verb = hint.direction === 'rise' ? 'rise' : 'fall';
  return `${hint.chance === 'likely' ? 'Likely' : 'Could'} to ${verb} ${when(hint.updatesAway)}`;
}

interface Props {
  title: string;
  hints: PriceHint[];
  empty: string;
  /** Mark squad players (for league-wide lists). */
  markSquad?: boolean;
}

export function PriceWatchList({ title, hints, empty, markSquad = false }: Props) {
  return (
    <div className="price-list">
      <h3>{title}</h3>
      {hints.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul>
          {hints.map((h) => (
            <li key={h.id} className={`price-${h.direction}`}>
              <span className="price-arrow" aria-hidden>
                {h.direction === 'rise' ? '▲' : '▼'}
              </span>
              <span className="price-player">
                <strong>
                  {markSquad && h.inSquad && <span title="In your squad">★ </span>}
                  {h.webName}
                </strong>{' '}
                <span className="muted">
                  {h.clubShortName} · {h.position} · £{h.price.toFixed(1)}
                </span>
              </span>
              <span className="price-when">
                {describe(h)}
                <span className="muted">
                  {' '}
                  · {Math.round(h.progressPercent)}% · net {h.netTransfers > 0 ? '+' : ''}
                  {h.netTransfers.toLocaleString()}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
