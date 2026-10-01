import { useCallback, useEffect, useState } from 'react';
import { UnauthorizedError, api } from '../api.ts';
import { ManagerHeader } from '../components/ManagerHeader.tsx';
import { Pitch } from '../components/Pitch.tsx';
import { PlayerTable } from '../components/PlayerTable.tsx';
import type { MyTeamResponse } from '../types.ts';

interface Props {
  onLogout: () => void;
  onUnauthorized: () => void;
}

export function DashboardPage({ onLogout, onUnauthorized }: Props) {
  const [team, setTeam] = useState<MyTeamResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    try {
      setTeam(await api.getTeam(forceRefresh));
    } catch (err) {
      if (err instanceof UnauthorizedError) {
        onUnauthorized();
        return;
      }
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized]);

  useEffect(() => {
    void load();
    // Load once on mount (server cache is fine); the Refresh button forces fresh FPL data.
  }, []);

  return (
    <div className="dashboard">
      <header className="topbar">
        <span className="brand">⚽ My FPL Team</span>
        <div className="topbar-actions">
          <button className="secondary" onClick={() => void load(true)} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </button>
          <button className="secondary" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="content">
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
      </main>
    </div>
  );
}
