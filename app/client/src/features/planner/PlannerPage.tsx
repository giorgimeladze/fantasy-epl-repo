import { api } from '../../api.ts';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { PageToolbar } from '../../components/PageToolbar.tsx';
import { useApiResource } from '../../hooks/useApiResource.ts';
import { fetchedAt, gameweekRange } from '../../lib/format.ts';
import type { PageProps } from '../../routes.ts';
import { ChipCard } from './ChipCard.tsx';
import { DraftPlan } from './DraftPlan.tsx';
import { RotationTable } from './RotationTable.tsx';

export function PlannerPage({ onUnauthorized }: PageProps) {
  const { data, error, loading, reload } = useApiResource(api.getPlanner, onUnauthorized);

  return (
    <>
      <PageToolbar title="Planner" loading={loading} onRefresh={() => void reload(true)} />
      {data && (
        <p className="muted intro">
          {gameweekRange(data.gameweeks)} · {fetchedAt(data.cache)}
        </p>
      )}

      <DraftPlan onUnauthorized={onUnauthorized} />

      <ErrorMessage error={error} />
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
