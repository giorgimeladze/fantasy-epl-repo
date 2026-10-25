import { money, pct, pts, signed } from '../../lib/format.ts';
import type { TransferOption, TransferPlayer, TransfersResponse } from '../../types.ts';

function headline(option: TransferOption, data: TransfersResponse): string {
  const weeks = `${data.gameweeks.length} GW${data.gameweeks.length === 1 ? '' : 's'}`;
  if (option.moves.length === 0) {
    return `Save the transfer: ${option.freeTransfersNext} free next week, ${money(option.bankAfter)} in the bank`;
  }
  const moves = option.moves.map((m) => `Sell ${m.out.webName} → buy ${m.in.webName}`).join(', ');
  const hit = option.hitCost > 0 ? ` after a −${option.hitCost}` : '';
  return `${moves}: ${signed(option.netGain)} predicted points over ${weeks}${hit}, ${money(option.bankAfter)} left`;
}

/** How the gain adds up: over the horizon, minus any hit, minus the banked transfer given up. */
function gainLine(option: TransferOption): string {
  const hit = option.hitCost > 0 ? ` − ${option.hitCost} hit = ${signed(option.netGain)}` : '';
  const banked = option.score !== option.netGain
    ? ` − ${pts(option.netGain - option.score)} for the banked transfer given up = ${signed(option.score)} vs saving`
    : '';
  const next = `${option.freeTransfersNext} free transfer${option.freeTransfersNext === 1 ? '' : 's'} next week`;
  return `${signed(option.gain)} over the horizon${hit}${banked} · ${next}`;
}

function PlayerLine({ player, label }: { player: TransferPlayer; label: string }) {
  return (
    <div className="transfer-player">
      <div className="transfer-player-head">
        <span className="muted">{label}</span> <strong>{player.webName}</strong>{' '}
        <span className="muted">
          {player.clubShortName} · {player.position} · {money(player.price)} · plays {pct(player.playChance)}
        </span>
      </div>
      <div className="transfer-points">
        {player.gameweekPoints.map((p, i) => (
          <span key={i} className={p === 0 ? 'xp-blank' : ''}>
            {pts(p)}
          </span>
        ))}
        <strong>= {pts(player.horizonPoints)}</strong>
      </div>
      <span className="reasons">{player.reasons.join(' · ')}</span>
    </div>
  );
}

interface Props {
  option: TransferOption;
  data: TransfersResponse;
  best?: boolean;
}

/** One transfer option (or "save"): both players per move and how the squad's points change. */
export function OptionCard({ option, data, best = false }: Props) {
  return (
    <li className={best ? 'transfer-option best' : 'transfer-option'}>
      <div className="transfer-headline">
        <strong>{headline(option, data)}</strong>
      </div>
      {option.moves.map((m) => (
        <div key={m.out.id} className="transfer-move">
          <PlayerLine player={m.out} label={`Sell (${money(m.sellingPrice)})`} />
          <PlayerLine player={m.in} label="Buy" />
        </div>
      ))}
      {option.moves.length > 0 && (
        <div className="muted transfer-detail">
          <div>
            Squad points per gameweek:{' '}
            {data.gameweeks
              .map((gw, i) => {
                const before = data.squadPerGameweek[i] ?? 0;
                const gain = option.gainPerGameweek[i] ?? 0;
                return `GW${gw} ${pts(before)} → ${pts(before + gain)}`;
              })
              .join(' · ')}
          </div>
          <div>{gainLine(option)}</div>
        </div>
      )}
    </li>
  );
}
