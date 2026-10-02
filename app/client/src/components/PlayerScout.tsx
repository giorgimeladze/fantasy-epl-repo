import { useEffect, useMemo, useState } from 'react';
import { UnauthorizedError, api } from '../api.ts';
import type { PlayerHeadToHeadResponse, Position, ScoutClubOption } from '../types.ts';
import { HeadToHeadCard } from './HeadToHeadCard.tsx';

const POSITION_GROUPS: Array<[Position, string]> = [
  ['GK', 'Goalkeepers'],
  ['DEF', 'Defenders'],
  ['MID', 'Midfielders'],
  ['FWD', 'Forwards'],
];

interface Props {
  /** Player ids in the manager's squad, to tag them in the result. */
  squadIds: ReadonlySet<number>;
  onUnauthorized: () => void;
}

/** Pick any club, then any of its players, and see their record against their next opponent. */
export function PlayerScout({ squadIds, onUnauthorized }: Props) {
  const [clubs, setClubs] = useState<ScoutClubOption[] | null>(null);
  const [clubId, setClubId] = useState<number | null>(null);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [result, setResult] = useState<PlayerHeadToHeadResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleError(err: unknown) {
    if (err instanceof UnauthorizedError) onUnauthorized();
    else setError((err as Error).message);
  }

  useEffect(() => {
    api.getScoutOptions().then((res) => setClubs(res.clubs), handleError);
    // Options only need loading once.
  }, []);

  useEffect(() => {
    if (playerId === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getPlayerHeadToHead(playerId)
      .then((res) => !cancelled && setResult(res), (err) => !cancelled && handleError(err))
      .finally(() => !cancelled && setLoading(false));
    // Ignore a slow response if the user has already picked someone else.
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  const club = useMemo(() => clubs?.find((c) => c.id === clubId) ?? null, [clubs, clubId]);

  function selectClub(value: string) {
    setClubId(value ? Number(value) : null);
    setPlayerId(null);
    setResult(null);
  }

  return (
    <section className="scout">
      <h2>Scout any player</h2>
      <p className="muted">
        Choose a club, then a player, to see their last 4 matches against the team they play next.
      </p>

      <div className="scout-controls">
        <label>
          Club
          <select value={clubId ?? ''} onChange={(e) => selectClub(e.target.value)} disabled={!clubs}>
            <option value="">{clubs ? 'Select a club…' : 'Loading clubs…'}</option>
            {clubs?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Player
          <select
            value={playerId ?? ''}
            onChange={(e) => setPlayerId(e.target.value ? Number(e.target.value) : null)}
            disabled={!club}
          >
            <option value="">{club ? 'Select a player…' : 'Choose a club first'}</option>
            {club &&
              POSITION_GROUPS.map(([position, label]) => {
                const players = club.players.filter((p) => p.position === position);
                if (players.length === 0) return null;
                return (
                  <optgroup key={position} label={label}>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.webName}
                        {p.webName !== p.fullName ? ` (${p.fullName})` : ''}
                        {squadIds.has(p.id) ? ' ★' : ''}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
          </select>
        </label>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading && <p className="muted">Loading match history…</p>}
      {!loading && result && result.player.id === playerId && (
        <HeadToHeadCard data={result} tag={squadIds.has(result.player.id) ? 'In your squad' : undefined} />
      )}
    </section>
  );
}
