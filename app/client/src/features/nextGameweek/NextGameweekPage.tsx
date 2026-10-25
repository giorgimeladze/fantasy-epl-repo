import { api } from '../../api.ts';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { PageToolbar } from '../../components/PageToolbar.tsx';
import { useApiResource } from '../../hooks/useApiResource.ts';
import { deadline, fetchedAt } from '../../lib/format.ts';
import type { PageProps } from '../../routes.ts';
import { CaptainOptions } from './CaptainOptions.tsx';
import { Differentials } from './Differentials.tsx';
import { FormationList } from './FormationList.tsx';
import { LineupChanges } from './LineupChanges.tsx';
import { LineupPitch } from './LineupPitch.tsx';
import { LineupSummary } from './LineupSummary.tsx';
import { PriceWatchSection } from './PriceWatchSection.tsx';
import { ReasonsTable } from './ReasonsTable.tsx';

export function NextGameweekPage({ onUnauthorized }: PageProps) {
  const { data, error, loading, reload } = useApiResource(api.getNextGameweek, onUnauthorized);

  return (
    <>
      <PageToolbar
        title={data ? `Gameweek ${data.gameweek}` : 'Next gameweek'}
        loading={loading}
        onRefresh={() => void reload(true)}
      />
      {data && (
        <p className="muted intro">
          {data.deadline ? `Deadline ${deadline(data.deadline)} · ` : ''}
          {fetchedAt(data.cache)}
        </p>
      )}

      <ErrorMessage error={error} />
      {!data && loading && <p className="muted">Picking the best lineup…</p>}

      {data && (
        <>
          <LineupSummary data={data} />
          <LineupChanges data={data} />
          <LineupPitch lineup={data.best} gameweek={data.gameweek} />
          <CaptainOptions data={data} />
          <ReasonsTable data={data} />
          <FormationList data={data} />
          <PriceWatchSection priceWatch={data.priceWatch} />
          <Differentials differentials={data.differentials} />
        </>
      )}
    </>
  );
}
