import { money, pts, signed } from '../../lib/format.ts';
import type { ChipAdvice } from '../../types.ts';

/** One chip: availability, verdict, its value per gameweek as bars, and the method. */
export function ChipCard({ advice }: { advice: ChipAdvice }) {
  const top = Math.max(0.1, ...advice.weeks.map((w) => w.value));
  const { chip, wildcard } = advice;
  return (
    <div className={advice.bestGameweek !== null ? 'chip-card best' : 'chip-card'}>
      <div className="chip-card-head">
        <strong>{chip.label}</strong>
        <span className="muted">
          {chip.available
            ? `available${chip.availableUntil !== null ? ` until GW${chip.availableUntil}` : ''}`
            : chip.playedInGameweek
              ? `played in GW${chip.playedInGameweek}`
              : 'not available'}
        </span>
      </div>
      <p className="chip-verdict">{advice.verdict}</p>
      <ul className="chip-weeks">
        {advice.weeks.map((w) => (
          <li key={w.gameweek} className={w.gameweek === advice.bestGameweek ? 'best' : ''}>
            <span className="chip-gw">GW{w.gameweek}</span>
            <span className="chip-bar" aria-hidden>
              <span style={{ width: `${Math.max(0, (w.value / top) * 100)}%` }} />
            </span>
            <span className="chip-value">{signed(w.value)}</span>
            <span className="muted chip-explain">
              {w.explanation}
              {w.players.length > 0 && advice.chip.name !== '3xc' && (
                <>: {w.players.map((p) => `${p.webName} ${pts(p.points)}`).join(', ')}</>
              )}
            </span>
          </li>
        ))}
      </ul>
      {wildcard && wildcard.in.length > 0 && (
        <div className="muted chip-explain">
          In: {wildcard.in.map((p) => p.webName).join(', ')}.{' '}
          Out: {wildcard.out.map((p) => p.webName).join(', ')}.{' '}
          {signed(wildcard.gain)} vs your squad, {signed(wildcard.bestTransfersGain)} from the best normal{' '}
          transfers, {money(wildcard.bankAfter)} left.
        </div>
      )}
      <p className="muted chip-method">{advice.method}</p>
    </div>
  );
}
