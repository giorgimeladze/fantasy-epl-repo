import { api } from '../api.ts';
import { ManagerHeader } from '../components/ManagerHeader.tsx';
import { PageToolbar } from '../components/PageToolbar.tsx';
import { Pitch } from '../components/Pitch.tsx';
import { PlayerTable } from '../components/PlayerTable.tsx';
import { useApiResource } from '../hooks/useApiResource.ts';

interface Props {
  onUnauthorized: () => void;
}

export function DashboardPage({ onUnauthorized }: Props) {
  const { data: team, error, loading, reload } = useApiResource(api.getTeam, onUnauthorized);

  return (
    <>
      <PageToolbar title="My team" loading={loading} onRefresh={() => void reload(true)} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
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
