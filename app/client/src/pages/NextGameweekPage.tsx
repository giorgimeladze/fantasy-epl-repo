import { useState } from 'react';
import { api } from '../api.ts';
import { LineupPitch } from '../components/LineupPitch.tsx';
import { PageToolbar } from '../components/PageToolbar.tsx';
import { PriceWatchList } from '../components/PriceWatchList.tsx';
import { ProjectionTable } from '../components/ProjectionTable.tsx';
import { useApiResource } from '../hooks/useApiResource.ts';
import type { LineupPlayer, NextGameweekResponse, Position } from '../types.ts';

const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
const pts = (value: number) => value.toFixed(1);
const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`;
const pct = (value: number) => `${Math.round(value * 100)}%`;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const deadline = (iso: string) =>
  new Date(iso).toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

// Below this, the current lineup is as good as the best one for practical purposes.
const MEANINGFUL_GAIN = 0.5;

function Why({ player }: { player: LineupPlayer }) {
  return <span className="reasons">{player.reasons.join(' · ')}</span>;
}

function Summary({ data }: { data: NextGameweekResponse }) {
  const { best, current, gain } = data;
  return (
    <div className="next-summary">
      <dl className="stat-tiles">
        <div className="stat-tile">
          <dt>Best XI · {best.formation}</dt>
          <dd>
            {pts(best.expectedPoints)} <span className="muted">pts</span>
          </dd>
        </div>
        <div className="stat-tile">
          <dt>
            Your GW{data.comparedWithGameweek} lineup · {current.formation}
          </dt>
          <dd>
            {pts(current.expectedPoints)} <span className="muted">pts</span>
          </dd>
        </div>
        <div className="stat-tile">
          <dt>Difference</dt>
          <dd className={gain >= MEANINGFUL_GAIN ? 'gain' : ''}>{signed(gain)}</dd>
        </div>
      </dl>
      <p className="muted next-note">
        Best XI: starters {pts(best.expectedPoints - best.captainPoints - best.autosubPoints)} + armband{' '}
        {pts(best.captainPoints)} + automatic substitutions {pts(best.autosubPoints)}. Yours: starters{' '}
        {pts(current.expectedPoints - current.captainPoints - current.autosubPoints)} + armband{' '}
        {pts(current.captainPoints)} + automatic substitutions {pts(current.autosubPoints)}.
      </p>
      <p className="muted next-note">
        Predicted points include the captain's double points and expected automatic substitutions. FPL only shows next
        gameweek's picks after the deadline, so this compares with your GW{data.comparedWithGameweek} lineup.
      </p>
    </div>
  );
}

function Changes({ data }: { data: NextGameweekResponse }) {
  const { changes, captainChange, benchOrderChanged, best } = data;
  const nothing = changes.length === 0 && !captainChange && !benchOrderChanged;

  return (
    <section>
      <h2>What to change</h2>
      {nothing && <p className="muted">Your lineup is already the best one. Nothing to change.</p>}
      {!nothing && data.gain < MEANINGFUL_GAIN && (
        <p className="muted">These changes add under half a point, so your current lineup is fine too.</p>
      )}
      <ul className="change-list">
        {changes.map((c) => (
          <li key={c.in.id}>
            <div>
              Start <strong>{c.in.webName}</strong> instead of <strong>{c.out.webName}</strong>{' '}
              <span className={c.gain >= 0 ? 'gain' : 'loss'}>{signed(c.gain)}</span>
            </div>
            <div className="muted">
              {c.in.webName}: <Why player={c.in} />
            </div>
            <div className="muted">
              {c.out.webName}: <Why player={c.out} />
            </div>
          </li>
        ))}
        {captainChange && (
          <li>
            <div>
              Captain <strong>{captainChange.to.webName}</strong> instead of{' '}
              <strong>{captainChange.from.webName}</strong>
            </div>
            <div className="muted">
              {captainChange.to.webName}: <Why player={captainChange.to} />
            </div>
          </li>
        )}
        {benchOrderChanged && (
          <li>
            <div>
              Bench order: <strong>{best.bench.map((p) => p.webName).join(' → ')}</strong>
            </div>
            <div className="muted">Ordered so automatic substitutions bring on the most points.</div>
          </li>
        )}
      </ul>
    </section>
  );
}

function Captaincy({ data }: { data: NextGameweekResponse }) {
  return (
    <section>
      <h2>Captain</h2>
      <div className="captain-options">
        {data.captainOptions.map((o, i) => (
          <div key={o.player.id} className={i === 0 ? 'captain-option best' : 'captain-option'}>
            <div className="captain-head">
              <strong>
                {i === 0 ? '(C) ' : ''}
                {o.player.webName}
              </strong>
              <span className="muted">
                {o.player.clubShortName} · {o.player.position}
              </span>
            </div>
            <div className="captain-points">
              +{pts(o.captainPoints)} <span className="muted">from the armband · plays {pct(o.player.playChance)}</span>
            </div>
            <Why player={o.player} />
          </div>
        ))}
      </div>
      <p className="muted">
        Vice-captain: {data.best.starters.find((p) => p.id === data.best.viceCaptainId)?.webName ?? '–'}. The armband
        value includes the vice-captain taking over if the captain doesn't play.
      </p>
    </section>
  );
}

function Reasons({ data }: { data: NextGameweekResponse }) {
  const rows = [...data.best.starters, ...data.best.bench];
  const starters = new Set(data.best.starters.map((p) => p.id));
  return (
    <section>
      <h2>Why each player</h2>
      <div className="table-wrap">
        <table className="players">
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">Pts</th>
              <th className="num" title="Chance of playing (fitness and rotation)">
                Plays
              </th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className={starters.has(p.id) ? '' : 'benched'}>
                <td>
                  <div className="cell-player">
                    <strong>
                      {p.webName}
                      {p.id === data.best.captainId && ' (C)'}
                      {p.id === data.best.viceCaptainId && ' (V)'}
                    </strong>
                    <span className="muted">
                      {p.clubShortName} · {p.position}
                      {!starters.has(p.id) && ' · bench'}
                    </span>
                  </div>
                </td>
                <td className="num">{pts(p.points)}</td>
                <td className="num">{pct(p.playChance)}</td>
                <td>
                  <Why player={p} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Formations({ data }: { data: NextGameweekResponse }) {
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

interface Props {
  onUnauthorized: () => void;
}

export function NextGameweekPage({ onUnauthorized }: Props) {
  const { data, error, loading, reload } = useApiResource(api.getNextGameweek, onUnauthorized);
  const [position, setPosition] = useState<Position>('MID');

  return (
    <>
      <PageToolbar
        title={data ? `Gameweek ${data.gameweek}` : 'Next gameweek'}
        loading={loading}
        onRefresh={() => void reload(true)}
      />
      {data && (
        <p className="muted intro">
          {data.deadline ? `Deadline ${deadline(data.deadline)} · ` : ''}fetched at {time(data.cache.fetchedAt)}
          {data.cache.fromCache ? ' (cached)' : ''}
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && loading && <p className="muted">Picking the best lineup…</p>}

      {data && (
        <>
          <Summary data={data} />
          <Changes data={data} />
          <LineupPitch lineup={data.best} gameweek={data.gameweek} />
          <Captaincy data={data} />
          <Reasons data={data} />
          <Formations data={data} />

          <section>
            <h2>Price watch</h2>
            {data.priceWatch.available ? (
              <>
                <p className="muted">
                  FPL's own estimate of which prices change at the next few nightly updates (% = progress towards the
                  change). Sell a falling player before it drops, or buy a rising one before it goes up.
                </p>
                <div className="price-watch">
                  <PriceWatchList
                    title="Your squad"
                    hints={data.priceWatch.squad}
                    empty="No price changes expected for your players."
                  />
                  <PriceWatchList
                    title="Likely risers"
                    hints={data.priceWatch.risers}
                    empty="None expected."
                    markSquad
                  />
                  <PriceWatchList
                    title="Likely fallers"
                    hints={data.priceWatch.fallers}
                    empty="None expected."
                    markSquad
                  />
                </div>
              </>
            ) : (
              <p className="muted">FPL isn't publishing price-change data at the moment.</p>
            )}
          </section>

          <section>
            <h2>Differentials</h2>
            <p className="muted">
              Players you don't own, picked by under 10% of managers, with the most predicted points over the next
              gameweeks. Click a player for the breakdown.
            </p>
            <div className="h2h-controls">
              <div className="segmented" role="group" aria-label="Position">
                {POSITIONS.map((p) => (
                  <button key={p} className={position === p ? 'active' : ''} onClick={() => setPosition(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {data.differentials[position].length === 0 ? (
              <p className="muted">No differentials in this position.</p>
            ) : (
              <ProjectionTable
                players={data.differentials[position]}
                gameweeks={data.differentials[position][0]!.gameweeks.map((g) => g.gameweek)}
                showOwnership
              />
            )}
          </section>
        </>
      )}
    </>
  );
}
