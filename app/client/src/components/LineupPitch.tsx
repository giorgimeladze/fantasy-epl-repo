import type { LineupChoice, LineupPlayer, Position } from '../types.ts';
import { FixtureChip } from './FixtureChip.tsx';

const ROWS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];

function Card({ player, gameweek, armband }: { player: LineupPlayer; gameweek: number; armband?: 'C' | 'V' }) {
  const flagged = player.status !== 'a';
  return (
    <div className={`player-card${flagged ? ' flagged' : ''}`} title={player.reasons.join(' · ')}>
      {armband && <span className={armband === 'V' ? 'armband vice' : 'armband'}>{armband}</span>}
      <div className="shirt">{player.clubShortName}</div>
      <div className="player-name">{player.webName}</div>
      <div className="player-meta">
        {player.points.toFixed(1)} pts · plays {Math.round(player.playChance * 100)}%
      </div>
      {player.fixtures.length === 0 ? (
        <span className="muted xp-blank">Blank</span>
      ) : (
        <div className="fixtures">
          {player.fixtures.map((f) => (
            <FixtureChip key={`${f.opponent}-${f.isHome}`} fixture={{ ...f, gameweek, kickoffTime: null }} />
          ))}
        </div>
      )}
    </div>
  );
}

/** The suggested XI on a pitch, with armbands, and the bench in substitution order. */
export function LineupPitch({ lineup, gameweek }: { lineup: LineupChoice; gameweek: number }) {
  const armband = (p: LineupPlayer) =>
    p.id === lineup.captainId ? 'C' : p.id === lineup.viceCaptainId ? 'V' : undefined;

  return (
    <section>
      <h2>Best XI ({lineup.formation})</h2>
      <div className="pitch">
        {ROWS.map((position) => (
          <div key={position} className="pitch-row">
            {lineup.starters
              .filter((p) => p.position === position)
              .map((p) => (
                <Card key={p.id} player={p} gameweek={gameweek} armband={armband(p)} />
              ))}
          </div>
        ))}
      </div>
      <h2>Bench, in substitution order</h2>
      <div className="bench">
        {lineup.bench.map((p, i) => (
          <div key={p.id} className="bench-slot">
            <span className="muted">{i === 0 ? 'GK' : i}</span>
            <Card player={p} gameweek={gameweek} />
          </div>
        ))}
      </div>
    </section>
  );
}
