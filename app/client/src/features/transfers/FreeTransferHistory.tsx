import { CHIP_NAMES } from '../../lib/format.ts';
import type { TransfersResponse } from '../../types.ts';

export function FreeTransferHistory({ data }: { data: TransfersResponse }) {
  return (
    <section>
      <h2>Free transfers</h2>
      <p className="muted">
        Worked out from your season history: 1 a week, banked up to {data.maxFreeTransfers}; a Wildcard or Free Hit
        keeps what you had.
      </p>
      <div className="formation-list">
        {data.freeTransferHistory.map((w) => (
          <div key={w.gameweek} className="formation">
            <strong>GW{w.gameweek}</strong>
            <span>
              {w.transfers} made{w.chip ? ` · ${CHIP_NAMES[w.chip] ?? w.chip}` : ''}
            </span>
            <span className="muted">{w.freeAfter} free after</span>
          </div>
        ))}
      </div>
    </section>
  );
}
