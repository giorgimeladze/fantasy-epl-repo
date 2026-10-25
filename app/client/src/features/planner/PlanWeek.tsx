import { money, pts, signed } from '../../lib/format.ts';
import type { DraftWeek, PlannedTransfer } from '../../types.ts';

interface Props {
  week: DraftWeek;
  busy: boolean;
  onRemove: (transfer: PlannedTransfer) => void;
  onAdd: (transfer: PlannedTransfer) => void;
}

/** One gameweek of the draft plan: points against no transfers, the planned moves, and a suggested next move. */
export function PlanWeek({ week, busy, onRemove, onAdd }: Props) {
  const { lineup } = week;
  const difference = week.netPoints - week.baselinePoints;
  const hint = week.suggestion?.moves[0];

  return (
    <li className="transfer-option">
      <div className="plan-week-head">
        <strong>GW{week.gameweek}</strong>
        <span>
          {pts(week.netPoints)} pts{' '}
          <span className={difference >= 0 ? 'gain' : 'loss'}>{difference !== 0 && signed(difference)}</span>
        </span>
        <span className="muted">
          {week.freeTransfers} free · {money(week.bankAfter)} in the bank
        </span>
      </div>
      <span className="muted">
        {lineup.formation}: XI {pts(lineup.startersPoints)} + armband {pts(lineup.captainPoints)} + subs{' '}
        {pts(lineup.autosubPoints)}
        {week.hitCost > 0 && ` − ${week.hitCost} hit`}
      </span>
      {week.moves.map((m) => (
        <div key={m.out.id} className="plan-move">
          <span>
            Sell <strong>{m.out.webName}</strong> ({money(m.sellingPrice)}) → buy <strong>{m.in.webName}</strong> (
            {money(m.buyingPrice)})
          </span>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => onRemove({ gameweek: week.gameweek, outId: m.out.id, inId: m.in.id })}
            aria-label={`Remove ${m.out.webName} to ${m.in.webName}`}
          >
            Remove
          </button>
        </div>
      ))}
      {week.suggestion && hint && (
        <div className="plan-move plan-suggestion">
          <span className="muted">
            Suggested: sell {hint.out.webName} → buy {hint.in.webName}, {signed(week.suggestion.netGain)} over the rest
            of the plan
          </span>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => onAdd({ gameweek: week.gameweek, outId: hint.out.id, inId: hint.in.id })}
          >
            Add
          </button>
        </div>
      )}
    </li>
  );
}
