import { useState } from 'react';
import { money, pts } from '../../lib/format.ts';
import type { DraftPlanResponse, MarketPlayer, PlannedTransfer } from '../../types.ts';

interface Props {
  draft: DraftPlanResponse;
  players: Map<number, MarketPlayer>;
  onAdd: (transfer: PlannedTransfer) => void;
  busy: boolean;
}

/** Gameweek, who to sell (from that week's planned squad) and who to buy (same position). */
export function AddTransfer({ draft, players, onAdd, busy }: Props) {
  const [gameweek, setGameweek] = useState(draft.gameweek);
  const [outId, setOutId] = useState<number | null>(null);
  const [inId, setInId] = useState<number | null>(null);

  const week = draft.weeks.find((w) => w.gameweek === gameweek) ?? draft.weeks[0]!;
  // Moves already planned for this week are applied in `squad`; a new one goes on top of them.
  const squad = week.squad.flatMap((id) => players.get(id) ?? []);
  const out = outId === null ? undefined : players.get(outId);
  const options = out ? draft.market[out.position].filter((p) => !week.squad.includes(p.id)) : [];

  return (
    <div className="plan-add">
      <label>
        Gameweek
        <select value={gameweek} onChange={(e) => setGameweek(Number(e.target.value))}>
          {draft.gameweeks.map((gw) => (
            <option key={gw} value={gw}>
              GW{gw}
            </option>
          ))}
        </select>
      </label>
      <label>
        Sell
        <select
          value={outId ?? ''}
          onChange={(e) => {
            setOutId(e.target.value ? Number(e.target.value) : null);
            setInId(null);
          }}
        >
          <option value="">Choose a player…</option>
          {squad.map((p) => (
            <option key={p.id} value={p.id}>
              {p.position} · {p.webName} ({p.clubShortName}) · {pts(p.horizonPoints)} pts
            </option>
          ))}
        </select>
      </label>
      <label>
        Buy
        <select
          value={inId ?? ''}
          disabled={!out}
          onChange={(e) => setInId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">{out ? `Choose a ${out.position}…` : 'Pick who to sell first'}</option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.webName} ({p.clubShortName}) · {money(p.price)} · {pts(p.horizonPoints)} pts
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={busy || outId === null || inId === null}
        onClick={() => {
          if (outId !== null && inId !== null) onAdd({ gameweek, outId, inId });
          setOutId(null);
          setInId(null);
        }}
      >
        Add transfer
      </button>
    </div>
  );
}
