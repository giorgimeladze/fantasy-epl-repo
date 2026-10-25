import { Fragment, useState } from 'react';
import type { FixtureProjection, GameweekProjection, PlayerProjection, PointsBreakdown } from '../types.ts';
import { fixed, pct, pts } from '../lib/format.ts';
import { FixtureChip } from './FixtureChip.tsx';
import { FixtureExplanation } from './FixtureExplanation.tsx';

const BREAKDOWN_ROWS: Array<{ key: keyof PointsBreakdown; label: string }> = [
  { key: 'appearance', label: 'Appearance' },
  { key: 'goals', label: 'Goals' },
  { key: 'assists', label: 'Assists' },
  { key: 'cleanSheet', label: 'Clean sheet' },
  { key: 'goalsConceded', label: 'Goals conceded' },
  { key: 'saves', label: 'Saves' },
  { key: 'bonus', label: 'Bonus' },
  { key: 'defensiveContribution', label: 'Defensive contribution' },
  { key: 'cards', label: 'Cards' },
];

function heat(points: number): string {
  if (points >= 6) return 'xp-high';
  if (points >= 4) return 'xp-good';
  if (points < 2) return 'xp-low';
  return '';
}

function GameweekCell({ gw }: { gw: GameweekProjection }) {
  if (gw.fixtures.length === 0) {
    return (
      <td className="num xp-cell xp-blank" title={`GW${gw.gameweek}: no fixture`}>
        Blank
      </td>
    );
  }
  return (
    <td className={`num xp-cell ${heat(gw.points)}`}>
      <strong>{pts(gw.points)}</strong>
      <div className="fixtures xp-fixtures">
        {gw.fixtures.map((f) => (
          <FixtureChip
            key={`${f.opponent}-${f.isHome}`}
            fixture={{
              gameweek: gw.gameweek,
              opponent: f.opponent,
              isHome: f.isHome,
              difficulty: f.difficulty,
              kickoffTime: null,
            }}
          />
        ))}
      </div>
    </td>
  );
}

/** Per-fixture breakdown of where the predicted points come from. */
function Breakdown({ player }: { player: PlayerProjection }) {
  const fixtures: Array<{ gameweek: number; fixture: FixtureProjection }> = player.gameweeks.flatMap((g) =>
    g.fixtures.map((fixture) => ({ gameweek: g.gameweek, fixture })),
  );
  const [explained, setExplained] = useState(0);
  if (fixtures.length === 0) return <p className="muted">No fixtures in this period.</p>;
  const selected = fixtures[Math.min(explained, fixtures.length - 1)]!;

  return (
    <>
      <div className="table-wrap">
        <table className="players breakdown">
          <thead>
            <tr>
              <th>Expected points</th>
              {fixtures.map(({ gameweek, fixture }) => (
                <th key={`${gameweek}-${fixture.opponent}`} className="num">
                  GW{gameweek} {fixture.opponent} ({fixture.isHome ? 'H' : 'A'})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BREAKDOWN_ROWS.filter((row) => fixtures.some(({ fixture }) => fixture.breakdown[row.key] !== 0)).map(
              (row) => (
                <tr key={row.key}>
                  <td>{row.label}</td>
                  {fixtures.map(({ gameweek, fixture }) => (
                    <td key={`${gameweek}-${fixture.opponent}`} className="num">
                      {pts(fixture.breakdown[row.key])}
                    </td>
                  ))}
                </tr>
              ),
            )}
            <tr className="breakdown-total">
              <td>Total</td>
              {fixtures.map(({ gameweek, fixture }) => (
                <td key={`${gameweek}-${fixture.opponent}`} className="num">
                  {pts(fixture.points)}
                </td>
              ))}
            </tr>
            <tr className="breakdown-inputs">
              <td>Based on</td>
              {fixtures.map(({ gameweek, fixture }) => (
                <td key={`${gameweek}-${fixture.opponent}`} className="num">
                  {fixture.expectedMinutes}′ · starts {pct(fixture.startChance)}
                  <br />
                  xG {fixed(fixture.expectedGoals)} · xA {fixed(fixture.expectedAssists)}
                  <br />
                  CS {pct(fixture.cleanSheetChance)}
                  {fixture.headToHeadFactor !== 1 && ` · H2H ×${fixed(fixture.headToHeadFactor)}`}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <div className="segmented explain-picker" role="group" aria-label="Explain a fixture">
        {fixtures.map(({ gameweek, fixture }, index) => (
          <button
            key={`${gameweek}-${fixture.opponent}`}
            className={fixture === selected.fixture ? 'active' : ''}
            onClick={() => setExplained(index)}
          >
            GW{gameweek} {fixture.opponent}
          </button>
        ))}
      </div>
      <FixtureExplanation fixture={selected.fixture} gameweek={selected.gameweek} position={player.position} />
    </>
  );
}

interface Props {
  players: PlayerProjection[];
  gameweeks: number[];
  /** Mark players in the manager's squad (for league-wide lists). */
  markSquad?: boolean;
  /** Show the share of managers who own each player (for differentials). */
  showOwnership?: boolean;
}

export function ProjectionTable({ players, gameweeks, markSquad = false, showOwnership = false }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const columns = gameweeks.length + (showOwnership ? 5 : 4);

  return (
    <div className="table-wrap">
      <table className="players projections">
        <thead>
          <tr>
            <th>Player</th>
            <th className="num">£</th>
            {showOwnership && (
              <th className="num" title="Share of FPL managers who own the player">
                Sel %
              </th>
            )}
            <th className="num" title="FPL's own forecast for the next gameweek">
              FPL xP
            </th>
            {gameweeks.map((gw) => (
              <th key={gw} className="num">
                GW{gw}
              </th>
            ))}
            <th className="num" title={`Predicted points over GW${gameweeks[0]}–${gameweeks.at(-1)}`}>
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            const benched = !markSquad && p.pickPosition !== null && p.pickPosition > 11;
            return (
              <Fragment key={p.id}>
                <tr
                  className={benched ? 'clickable benched' : 'clickable'}
                  onClick={() => setOpen(open === p.id ? null : p.id)}
                  aria-expanded={open === p.id}
                >
                  <td>
                    <div className="cell-player">
                      <strong>
                        {markSquad && p.pickPosition !== null && <span title="In your squad">★ </span>}
                        {p.webName}
                      </strong>
                      <span className="muted">
                        {p.clubShortName} · {p.position}
                        {benched && ' · bench'}
                      </span>
                      {p.news && <span className="news">{p.news}</span>}
                    </div>
                  </td>
                  <td className="num">{pts(p.price)}</td>
                  {showOwnership && <td className="num">{pts(p.selectedByPercent)}</td>}
                  <td className="num">{p.fplExpectedPoints === null ? '–' : pts(p.fplExpectedPoints)}</td>
                  {p.gameweeks.map((gw) => (
                    <GameweekCell key={gw.gameweek} gw={gw} />
                  ))}
                  <td className="num">
                    <strong>{pts(p.horizonPoints)}</strong>
                  </td>
                </tr>
                {open === p.id && (
                  <tr className="breakdown-row">
                    <td colSpan={columns}>
                      <Breakdown player={p} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
