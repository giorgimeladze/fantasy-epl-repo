import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, UnauthorizedError } from '../api.ts';
import { PageToolbar } from '../components/PageToolbar.tsx';
import { useApiResource } from '../hooks/useApiResource.ts';
import type {
  ChipAdvice,
  DraftPlanResponse,
  DraftWeek,
  MarketPlayer,
  PlannedTransfer,
  PlannerResponse,
  RotationPair,
} from '../types.ts';

const pts = (value: number) => value.toFixed(1);
const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`;
const money = (value: number) => `£${value.toFixed(1)}m`;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ── Draft plan ────────────────────────────────────────────────────────────────

interface DraftState {
  data: DraftPlanResponse | null;
  error: string | null;
  busy: boolean;
}

function useDraft(onUnauthorized: () => void) {
  const [state, setState] = useState<DraftState>({ data: null, error: null, busy: true });

  const run = useCallback(
    async (call: () => Promise<DraftPlanResponse>) => {
      setState((s) => ({ ...s, busy: true, error: null }));
      try {
        const data = await call();
        setState({ data, error: null, busy: false });
      } catch (err) {
        if (err instanceof UnauthorizedError) {
          onUnauthorized();
          return;
        }
        // A rejected change keeps the previous plan on screen.
        setState((s) => ({ ...s, error: (err as Error).message, busy: false }));
      }
    },
    [onUnauthorized],
  );

  useEffect(() => {
    void run(api.getDraft);
    // Load once on mount only.
  }, []);

  return { ...state, run };
}

function Lineup({ week }: { week: DraftWeek }) {
  const { lineup } = week;
  return (
    <span className="muted">
      {lineup.formation}: XI {pts(lineup.startersPoints)} + armband {pts(lineup.captainPoints)} + subs{' '}
      {pts(lineup.autosubPoints)}
      {week.hitCost > 0 && ` − ${week.hitCost} hit`}
    </span>
  );
}

function AddTransfer({
  draft,
  players,
  onAdd,
  busy,
}: {
  draft: DraftPlanResponse;
  players: Map<number, MarketPlayer>;
  onAdd: (transfer: PlannedTransfer) => void;
  busy: boolean;
}) {
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

function DraftPlan({ onUnauthorized }: { onUnauthorized: () => void }) {
  const { data, error, busy, run } = useDraft(onUnauthorized);

  const players = useMemo(() => {
    const map = new Map<number, MarketPlayer>();
    if (!data) return map;
    for (const p of [...data.squad, ...Object.values(data.market).flat()]) map.set(p.id, p);
    for (const w of data.weeks) for (const m of w.moves) for (const p of [m.out, m.in]) map.set(p.id, p);
    return map;
  }, [data]);

  if (!data) return busy ? <p className="muted">Loading your plan…</p> : <p className="error">{error}</p>;

  const save = (transfers: PlannedTransfer[]) => void run(() => api.saveDraft(transfers));
  const remove = (t: PlannedTransfer) =>
    save(data.transfers.filter((x) => !(x.gameweek === t.gameweek && x.outId === t.outId && x.inId === t.inId)));

  return (
    <section>
      <h2>Draft plan</h2>
      <p className="muted">
        Queue transfers over the next gameweeks and see the predicted points follow. Free transfers bank (up to 5), and
        each one beyond them costs 4 points. Each week's points are the best XI from the planned squad, as on the Next
        GW page.
      </p>
      <dl className="stat-tiles">
        <div className="stat-tile">
          <dt>With the plan</dt>
          <dd>{pts(data.totalPoints)}</dd>
        </div>
        <div className="stat-tile">
          <dt>No transfers</dt>
          <dd>{pts(data.baselinePoints)}</dd>
        </div>
        <div className="stat-tile">
          <dt>Difference</dt>
          <dd className={data.gain > 0 ? 'gain' : data.gain < 0 ? 'loss' : ''}>{signed(data.gain)}</dd>
        </div>
      </dl>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {data.warnings.length > 0 && (
        <ul className="plan-warnings">
          {data.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <ul className="transfer-list plan-weeks">
        {data.weeks.map((week) => (
          <li key={week.gameweek} className="transfer-option">
            <div className="plan-week-head">
              <strong>GW{week.gameweek}</strong>
              <span>
                {pts(week.netPoints)} pts{' '}
                <span className={week.netPoints - week.baselinePoints >= 0 ? 'gain' : 'loss'}>
                  {week.netPoints !== week.baselinePoints && signed(week.netPoints - week.baselinePoints)}
                </span>
              </span>
              <span className="muted">
                {week.freeTransfers} free · {money(week.bankAfter)} in the bank
              </span>
            </div>
            <Lineup week={week} />
            {week.moves.map((m) => (
              <div key={m.out.id} className="plan-move">
                <span>
                  Sell <strong>{m.out.webName}</strong> ({money(m.sellingPrice)}) → buy <strong>{m.in.webName}</strong>{' '}
                  ({money(m.buyingPrice)})
                </span>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => remove({ gameweek: week.gameweek, outId: m.out.id, inId: m.in.id })}
                  aria-label={`Remove ${m.out.webName} to ${m.in.webName}`}
                >
                  Remove
                </button>
              </div>
            ))}
            {week.suggestion && week.suggestion.moves[0] && (
              <div className="plan-move plan-suggestion">
                <span className="muted">
                  Suggested: sell {week.suggestion.moves[0].out.webName} → buy {week.suggestion.moves[0].in.webName},{' '}
                  {signed(week.suggestion.netGain)} over the rest of the plan
                </span>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    save([
                      ...data.transfers,
                      {
                        gameweek: week.gameweek,
                        outId: week.suggestion!.moves[0]!.out.id,
                        inId: week.suggestion!.moves[0]!.in.id,
                      },
                    ])
                  }
                >
                  Add
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <AddTransfer draft={data} players={players} busy={busy} onAdd={(t) => save([...data.transfers, t])} />
      {data.transfers.length > 0 && (
        <button className="secondary" disabled={busy} onClick={() => void run(api.clearDraft)}>
          Clear the plan
        </button>
      )}
    </section>
  );
}

// ── Chips ─────────────────────────────────────────────────────────────────────

function ChipCard({ advice }: { advice: ChipAdvice }) {
  const top = Math.max(0.1, ...advice.weeks.map((w) => w.value));
  const { chip } = advice;
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
      {advice.wildcard && advice.wildcard.in.length > 0 && (
        <div className="muted chip-explain">
          In: {advice.wildcard.in.map((p) => p.webName).join(', ')}. Out:{' '}
          {advice.wildcard.out.map((p) => p.webName).join(', ')}. {signed(advice.wildcard.gain)} vs your squad,{' '}
          {signed(advice.wildcard.bestTransfersGain)} from the best normal transfers, {money(advice.wildcard.bankAfter)}{' '}
          left.
        </div>
      )}
      <p className="muted chip-method">{advice.method}</p>
    </div>
  );
}

// ── Rotation ──────────────────────────────────────────────────────────────────

function RotationTable({ pairs, unit, gameweeks }: { pairs: RotationPair[]; unit: string; gameweeks: number[] }) {
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
                  <div className="muted">{w.value.toFixed(2)}</div>
                </td>
              ))}
              <td className="num">
                <strong>{pair.total.toFixed(2)}</strong>
              </td>
              <td className="num">{signed(pair.total - pair.bestSingle)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

interface Props {
  onUnauthorized: () => void;
}

export function PlannerPage({ onUnauthorized }: Props) {
  const { data, error, loading, reload } = useApiResource<PlannerResponse>(api.getPlanner, onUnauthorized);

  return (
    <>
      <PageToolbar title="Planner" loading={loading} onRefresh={() => void reload(true)} />
      {data && (
        <p className="muted intro">
          GW{data.gameweeks[0]}–{data.gameweeks.at(-1)} · fetched at {time(data.cache.fetchedAt)}
          {data.cache.fromCache ? ' (cached)' : ''}
        </p>
      )}

      <DraftPlan onUnauthorized={onUnauthorized} />

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && loading && <p className="muted">Timing chips and pairing clubs…</p>}
      {data && (
        <>
          <section>
            <h2>Chips</h2>
            <p className="muted">
              What each chip would add in each of the next gameweeks, from the same predictions. Only these gameweeks
              are compared: a later double or blank gameweek may still be better.
            </p>
            <div className="chip-cards">
              {data.chips.map((c) => (
                <ChipCard key={c.chip.name} advice={c} />
              ))}
            </div>
          </section>

          <section>
            <h2>Rotation: goalkeepers</h2>
            <p className="muted">
              Two keepers costing £10m or less in total whose fixtures cover each other: start whichever has more
              predicted points that week. Only pairs where each keeper starts at least twice.
            </p>
            <RotationTable pairs={data.rotation.goalkeepers} unit="predicted points" gameweeks={data.gameweeks} />
          </section>

          <section>
            <h2>Rotation: defences</h2>
            <p className="muted">
              Pairs of clubs by expected clean sheets each week (a double gameweek counts both). Start the defenders of
              the club in bold.
            </p>
            <RotationTable pairs={data.rotation.defences} unit="expected clean sheets" gameweeks={data.gameweeks} />
          </section>
        </>
      )}
    </>
  );
}
