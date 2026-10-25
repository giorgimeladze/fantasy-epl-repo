import { pts, signed } from '../../lib/format.ts';
import type { NextGameweekResponse } from '../../types.ts';

/** Every formation's best expected points, against the best one. */
export function FormationList({ data }: { data: NextGameweekResponse }) {
  const best = data.formations[0]?.expectedPoints ?? 0;
  return (
    <section>
      <h2>Formations</h2>
      <div className="formation-list">
        {data.formations.map((f) => (
          <div key={f.formation} className={f.formation === data.best.formation ? 'formation best' : 'formation'}>
            <strong>{f.formation}</strong>
            <span>{pts(f.expectedPoints)}</span>
            <span className="muted">{f.expectedPoints === best ? 'best' : signed(f.expectedPoints - best)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
