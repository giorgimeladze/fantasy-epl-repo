import type { UpcomingFixture } from '../types.ts';

export function FixtureChip({ fixture }: { fixture: UpcomingFixture }) {
  return (
    <span
      className={`fixture fdr-${fixture.difficulty}`}
      title={`GW${fixture.gameweek} · difficulty ${fixture.difficulty}/5`}
    >
      {fixture.opponent} ({fixture.isHome ? 'H' : 'A'})
    </span>
  );
}
