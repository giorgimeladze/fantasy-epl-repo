import { StatTiles } from '../../components/StatTiles.tsx';
import { pts, signed } from '../../lib/format.ts';
import type { LineupChoice, NextGameweekResponse } from '../../types.ts';

// Below this, the current lineup is as good as the best one for practical purposes.
export const MEANINGFUL_GAIN = 0.5;

const parts = (l: LineupChoice) =>
  `starters ${pts(l.expectedPoints - l.captainPoints - l.autosubPoints)} + armband ${pts(l.captainPoints)} `
  + `+ automatic substitutions ${pts(l.autosubPoints)}`;

/** Best XI against the current lineup, with how each total is made up. */
export function LineupSummary({ data }: { data: NextGameweekResponse }) {
  const { best, current, gain } = data;
  const points = (value: number) => (
    <>
      {pts(value)} <span className="muted">pts</span>
    </>
  );
  return (
    <div className="next-summary">
      <StatTiles
        tiles={[
          { label: `Best XI · ${best.formation}`, value: points(best.expectedPoints) },
          {
            label: `Your GW${data.comparedWithGameweek} lineup · ${current.formation}`,
            value: points(current.expectedPoints),
          },
          { label: 'Difference', value: signed(gain), className: gain >= MEANINGFUL_GAIN ? 'gain' : '' },
        ]}
      />
      <p className="muted next-note">
        Best XI: {parts(best)}. Yours: {parts(current)}.
      </p>
      <p className="muted next-note">
        Predicted points include the captain's double points and expected automatic substitutions. FPL only shows next
        gameweek's picks after the deadline, so this compares with your GW{data.comparedWithGameweek} lineup.
      </p>
    </div>
  );
}
