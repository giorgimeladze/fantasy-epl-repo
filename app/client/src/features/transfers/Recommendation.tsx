import { pts, signed } from '../../lib/format.ts';
import type { TransfersResponse } from '../../types.ts';
import { OptionCard } from './OptionCard.tsx';

/** Why the recommended option beats the others (or why saving does). */
function reason(data: TransfersResponse): string {
  const banked = pts(data.rules.savedTransferValue);
  if (data.recommended.moves.length > 0) {
    return `Beats saving the transfer (${data.save.freeTransfersNext} free next week) after allowing ${banked} points `
      + 'for each banked transfer given up.';
  }
  const bestSingle = data.single[0];
  if (!bestSingle) return 'No affordable transfer is allowed (budget, position or 3 per club), or none adds points.';
  return `The best transfer adds ${signed(bestSingle.netGain)}, less than the ${banked} points a banked free transfer `
    + 'is taken to be worth.';
}

export function Recommendation({ data }: { data: TransfersResponse }) {
  return (
    <section>
      <h2>Recommendation</h2>
      <ul className="transfer-list">
        <OptionCard option={data.recommended} data={data} best />
      </ul>
      <p className="muted next-note">
        {reason(data)} Gains are the squad's best XI each week, with captain and automatic substitutions, against
        keeping the squad.
      </p>
    </section>
  );
}
