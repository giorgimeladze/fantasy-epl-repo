import type { TransferOption, TransfersResponse } from '../../types.ts';
import { OptionCard } from './OptionCard.tsx';

interface Props {
  title: string;
  options: TransferOption[];
  data: TransfersResponse;
  empty: string;
}

export function OptionList({ title, options, data, empty }: Props) {
  return (
    <section>
      <h2>{title}</h2>
      {options.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="transfer-list">
          {options.map((o) => (
            <OptionCard key={o.moves.map((m) => `${m.out.id}>${m.in.id}`).join()} option={o} data={data} />
          ))}
        </ul>
      )}
    </section>
  );
}
