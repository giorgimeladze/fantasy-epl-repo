import { useMemo } from 'react';
import { api } from '../../api.ts';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { StatTiles } from '../../components/StatTiles.tsx';
import { useApiResource } from '../../hooks/useApiResource.ts';
import { pts, signed } from '../../lib/format.ts';
import type { PageProps } from '../../routes.ts';
import type { MarketPlayer, PlannedTransfer } from '../../types.ts';
import { AddTransfer } from './AddTransfer.tsx';
import { PlanWeek } from './PlanWeek.tsx';

const gainClass = (value: number) => (value > 0 ? 'gain' : value < 0 ? 'loss' : '');

/** The manager's draft plan: queued transfers per gameweek, replayed on today's predictions. */
export function DraftPlan({ onUnauthorized }: PageProps) {
  const { data, error, loading: busy, mutate } = useApiResource(api.getDraft, onUnauthorized);

  const players = useMemo(() => {
    const map = new Map<number, MarketPlayer>();
    if (!data) return map;
    for (const p of [...data.squad, ...Object.values(data.market).flat()]) map.set(p.id, p);
    for (const w of data.weeks) for (const m of w.moves) for (const p of [m.out, m.in]) map.set(p.id, p);
    return map;
  }, [data]);

  if (!data) return busy ? <p className="muted">Loading your plan…</p> : <ErrorMessage error={error} />;

  const save = (transfers: PlannedTransfer[]) => void mutate(() => api.saveDraft(transfers));
  const same = (a: PlannedTransfer, b: PlannedTransfer) =>
    a.gameweek === b.gameweek && a.outId === b.outId && a.inId === b.inId;
  const remove = (t: PlannedTransfer) => save(data.transfers.filter((x) => !same(x, t)));

  return (
    <section>
      <h2>Draft plan</h2>
      <p className="muted">
        Queue transfers over the next gameweeks and see the predicted points follow. Free transfers bank (up to 5), and
        each one beyond them costs 4 points. Each week's points are the best XI from the planned squad, as on the Next
        GW page.
      </p>
      <StatTiles
        tiles={[
          { label: 'With the plan', value: pts(data.totalPoints) },
          { label: 'No transfers', value: pts(data.baselinePoints) },
          { label: 'Difference', value: signed(data.gain), className: gainClass(data.gain) },
        ]}
      />

      <ErrorMessage error={error} />
      {data.warnings.length > 0 && (
        <ul className="plan-warnings">
          {data.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <ul className="transfer-list plan-weeks">
        {data.weeks.map((week) => (
          <PlanWeek
            key={week.gameweek}
            week={week}
            busy={busy}
            onRemove={(t) => remove(t)}
            onAdd={(t) => save([...data.transfers, t])}
          />
        ))}
      </ul>

      <AddTransfer draft={data} players={players} busy={busy} onAdd={(t) => save([...data.transfers, t])} />
      {data.transfers.length > 0 && (
        <button className="secondary" disabled={busy} onClick={() => void mutate(api.clearDraft)}>
          Clear the plan
        </button>
      )}
    </section>
  );
}
