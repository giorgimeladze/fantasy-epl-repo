import { api } from '../../api.ts';
import { ManagerHeader } from './ManagerHeader.tsx';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { PageToolbar } from '../../components/PageToolbar.tsx';
import { Pitch } from './Pitch.tsx';
import { PlayerTable } from './PlayerTable.tsx';
import { useApiResource } from '../../hooks/useApiResource.ts';
import type { PageProps } from '../../routes.ts';

export function DashboardPage({ onUnauthorized }: PageProps) {
  const { data: team, error, loading, reload } = useApiResource(api.getTeam, onUnauthorized);

  return (
    <>
      <PageToolbar title="My team" loading={loading} onRefresh={() => void reload(true)} />
      <ErrorMessage error={error} />
      {!team && loading && <p className="muted">Fetching your squad from FPL…</p>}
      {team && (
        <>
          <ManagerHeader manager={team.manager} gameweek={team.gameweek} cache={team.cache} />
          <Pitch players={team.players} />
          <PlayerTable players={team.players} />
        </>
      )}
    </>
  );
}
