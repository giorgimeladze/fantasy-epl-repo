import { signed } from '../../lib/format.ts';
import type { NextGameweekResponse } from '../../types.ts';
import { MEANINGFUL_GAIN } from './LineupSummary.tsx';
import { PlayerWhy } from './PlayerWhy.tsx';

/** "Start X instead of Y", the captain change and the bench order, each with its reasons. */
export function LineupChanges({ data }: { data: NextGameweekResponse }) {
  const { changes, captainChange, benchOrderChanged, best } = data;
  const nothing = changes.length === 0 && !captainChange && !benchOrderChanged;

  return (
    <section>
      <h2>What to change</h2>
      {nothing && <p className="muted">Your lineup is already the best one. Nothing to change.</p>}
      {!nothing && data.gain < MEANINGFUL_GAIN && (
        <p className="muted">These changes add under half a point, so your current lineup is fine too.</p>
      )}
      <ul className="change-list">
        {changes.map((c) => (
          <li key={c.in.id}>
            <div>
              Start <strong>{c.in.webName}</strong> instead of <strong>{c.out.webName}</strong>{' '}
              <span className={c.gain >= 0 ? 'gain' : 'loss'}>{signed(c.gain)}</span>
            </div>
            <div className="muted">
              {c.in.webName}: <PlayerWhy player={c.in} />
            </div>
            <div className="muted">
              {c.out.webName}: <PlayerWhy player={c.out} />
            </div>
          </li>
        ))}
        {captainChange && (
          <li>
            <div>
              Captain <strong>{captainChange.to.webName}</strong> instead of{' '}
              <strong>{captainChange.from.webName}</strong>
            </div>
            <div className="muted">
              {captainChange.to.webName}: <PlayerWhy player={captainChange.to} />
            </div>
          </li>
        )}
        {benchOrderChanged && (
          <li>
            <div>
              Bench order: <strong>{best.bench.map((p) => p.webName).join(' → ')}</strong>
            </div>
            <div className="muted">Ordered so automatic substitutions bring on the most points.</div>
          </li>
        )}
      </ul>
    </section>
  );
}
