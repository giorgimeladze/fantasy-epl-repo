import type { PlayerView, Position } from '../types.ts';
import { FixtureChip } from './FixtureChip.tsx';

const ROWS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];

function PlayerCard({ player }: { player: PlayerView }) {
  const next = player.nextFixtures[0];
  const flagged = player.status !== 'a';

  return (
    <div className={`player-card${flagged ? ' flagged' : ''}`} title={player.news || player.fullName}>
      {player.isCaptain && <span className="armband">C</span>}
      {player.isViceCaptain && <span className="armband vice">V</span>}
      <div className="shirt">{player.club.shortName}</div>
      <div className="player-name">{player.webName}</div>
      <div className="player-meta">
        {player.gameweekPoints * Math.max(player.multiplier, 1)} pts · form {player.form.toFixed(1)}
      </div>
      {next && <FixtureChip fixture={next} />}
    </div>
  );
}

export function Pitch({ players }: { players: PlayerView[] }) {
  const starters = players.filter((p) => p.isStarter);
  const bench = players.filter((p) => !p.isStarter);

  return (
    <section>
      <h2>Starting XI</h2>
      <div className="pitch">
        {ROWS.map((position) => (
          <div key={position} className="pitch-row">
            {starters
              .filter((p) => p.position === position)
              .map((p) => (
                <PlayerCard key={p.id} player={p} />
              ))}
          </div>
        ))}
      </div>
      <h2>Bench</h2>
      <div className="bench">
        {bench.map((p) => (
          <PlayerCard key={p.id} player={p} />
        ))}
      </div>
    </section>
  );
}
