import { pct, pts } from '../../lib/format.ts';
import type { NextGameweekResponse } from '../../types.ts';
import { PlayerWhy } from './PlayerWhy.tsx';

/** The best captains by what the armband adds, and the vice-captain. */
export function CaptainOptions({ data }: { data: NextGameweekResponse }) {
  const vice = data.best.starters.find((p) => p.id === data.best.viceCaptainId);
  return (
    <section>
      <h2>Captain</h2>
      <div className="captain-options">
        {data.captainOptions.map((o, i) => (
          <div key={o.player.id} className={i === 0 ? 'captain-option best' : 'captain-option'}>
            <div className="captain-head">
              <strong>
                {i === 0 ? '(C) ' : ''}
                {o.player.webName}
              </strong>
              <span className="muted">
                {o.player.clubShortName} · {o.player.position}
              </span>
            </div>
            <div className="captain-points">
              +{pts(o.captainPoints)} <span className="muted">from the armband · plays {pct(o.player.playChance)}</span>
            </div>
            <PlayerWhy player={o.player} />
          </div>
        ))}
      </div>
      <p className="muted">
        Vice-captain: {vice?.webName ?? '–'}. The armband value includes the vice-captain taking over if the captain
        doesn't play.
      </p>
    </section>
  );
}
