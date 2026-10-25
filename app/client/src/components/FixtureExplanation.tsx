import { fixed, pct } from '../lib/format.ts';
import type { FixtureProjection, Position } from '../types.ts';

const mins = (value: number) => `${Math.round(value)}′`;

interface Line {
  label: string;
  formula: string;
  result: string;
}

/** Every line of a fixture's predicted points as the formula the model used. */
function lines(f: FixtureProjection, position: Position): Line[] {
  const i = f.inputs;
  const startChance = i.availability * i.startShare;
  const starts = `${pct(startChance)} start`;
  const playsSixty = `${pct(i.sixtyMinuteChance)} plays 60′`;
  const minutes = startChance * i.minutesPerStart + i.subChance * i.subMinutes;
  const share = `${mins(minutes)}/90′`;
  const venue = `${fixed(i.venueFactor)} ${f.isHome ? 'home' : 'away'}`;
  const h2h = f.headToHeadFactor !== 1 ? ` × ${fixed(f.headToHeadFactor)} H2H` : '';
  const fixture = `${fixed(i.opponentDefence)} ${f.opponent} defence × ${venue}${h2h}`;
  const b = f.breakdown;

  const result: Line[] = [
    {
      label: 'Minutes',
      formula:
        `${pct(i.availability)} fit × ${pct(i.startShare)} starts × ${mins(i.minutesPerStart)} per start`
        + (i.subChance > 0 ? ` + ${pct(i.subChance)} sub × ${mins(i.subMinutes)}` : ''),
      result: mins(minutes),
    },
    {
      label: 'Appearance',
      formula: `${pct(startChance)} start + ${pct(i.subChance)} sub (1 pt) + ${playsSixty} (1 more)`,
      result: fixed(b.appearance),
    },
  ];
  if (b.goals !== 0) {
    result.push({
      label: 'Goals',
      formula:
        `${fixed(i.goalsPer90)} xG/90 × ${share} × ${fixture} = `
        + `${fixed(f.expectedGoals)} xG × ${i.goalPoints} pts`,
      result: fixed(b.goals),
    });
  }
  if (b.assists !== 0) {
    result.push({
      label: 'Assists',
      formula:
        `${fixed(i.assistsPer90)} xA/90 × ${share} × ${fixture} = `
        + `${fixed(f.expectedAssists)} xA × ${i.assistPoints} pts`,
      result: fixed(b.assists),
    });
  }
  const goalsAgainst =
    `${fixed(i.leagueGoalsPerMatch)} league goals × ${fixed(i.opponentAttack)} ${f.opponent} attack × `
    + `${fixed(i.clubDefence)} own defence ÷ ${venue} = ${fixed(i.expectedGoalsAgainst)} goals against`;
  if (b.cleanSheet !== 0) {
    result.push({
      label: 'Clean sheet',
      formula: `${goalsAgainst} → ${pct(f.cleanSheetChance)} clean sheet × ${playsSixty} × ${i.cleanSheetPoints} pts`,
      result: fixed(b.cleanSheet),
    });
  }
  if (b.goalsConceded !== 0) {
    result.push({
      label: 'Goals conceded',
      formula: `−1 per 2 of ${fixed(i.expectedGoalsAgainst)} goals against (Poisson) × ${playsSixty}`,
      result: fixed(b.goalsConceded),
    });
  }
  if (position === 'GK' && b.saves !== 0) {
    result.push({
      label: 'Saves',
      formula: `${fixed(i.savesPerMatch)} saves per match (vs ${f.opponent}'s attack) → 1 pt per 3 × ${starts}`,
      result: fixed(b.saves),
    });
  }
  if (b.bonus !== 0) {
    result.push({
      label: 'Bonus',
      formula: `${fixed(i.bonusPer90)} bonus/90 × ${share}${h2h}`,
      result: fixed(b.bonus),
    });
  }
  if (i.defensiveThreshold !== null && b.defensiveContribution !== 0) {
    result.push({
      label: 'Defensive contribution',
      formula:
        `${fixed(i.defensiveActionsPerMatch)} actions per match → ${pct(i.defensiveContributionChance)} chance of `
        + `${i.defensiveThreshold}+ × ${starts} × 2 pts`,
      result: fixed(b.defensiveContribution),
    });
  }
  if (b.cards !== 0) {
    result.push({
      label: 'Cards',
      formula: `−${fixed(i.cardPointsPer90)} card points/90 × ${share}`,
      result: fixed(b.cards),
    });
  }
  return result;
}

interface Props {
  fixture: FixtureProjection;
  gameweek: number;
  position: Position;
}

export function FixtureExplanation({ fixture, gameweek, position }: Props) {
  return (
    <div className="explain">
      <h4>
        How GW{gameweek} {fixture.opponent} ({fixture.isHome ? 'H' : 'A'}) adds up to {fixed(fixture.points)}
      </h4>
      <dl className="explain-lines">
        {lines(fixture, position).map((line) => (
          <div key={line.label} className="explain-line">
            <dt>{line.label}</dt>
            <dd>
              <span className="explain-formula">{line.formula}</span>
              <strong className="explain-result">{line.result}</strong>
            </dd>
          </div>
        ))}
      </dl>
      <p className="muted explain-note">
        Rates per 90 are this season's, steadied with last season's (or the position average) so a few games don't swing
        them. Club attack and defence are xG for and against relative to the league average (1.00).
      </p>
    </div>
  );
}
