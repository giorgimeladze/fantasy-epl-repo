import type { FixtureProjection, Position } from '../types.ts';

const pts = (value: number) => value.toFixed(2);
const f2 = (value: number) => value.toFixed(2);
const pct = (value: number) => `${Math.round(value * 100)}%`;
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
  const minutes = startChance * i.minutesPerStart + i.subChance * i.subMinutes;
  const share = `${mins(minutes)}/90′`;
  const venue = `${f2(i.venueFactor)} ${f.isHome ? 'home' : 'away'}`;
  const h2h = f.headToHeadFactor !== 1 ? ` × ${f2(f.headToHeadFactor)} H2H` : '';
  const fixture = `${f2(i.opponentDefence)} ${f.opponent} defence × ${venue}${h2h}`;
  const b = f.breakdown;

  const result: Line[] = [
    {
      label: 'Minutes',
      formula:
        `${pct(i.availability)} fit × ${pct(i.startShare)} starts × ${mins(i.minutesPerStart)} per start` +
        (i.subChance > 0 ? ` + ${pct(i.subChance)} sub × ${mins(i.subMinutes)}` : ''),
      result: mins(minutes),
    },
    {
      label: 'Appearance',
      formula: `${pct(startChance)} start + ${pct(i.subChance)} sub (1 pt) + ${pct(i.sixtyMinuteChance)} plays 60′ (1 more)`,
      result: pts(b.appearance),
    },
  ];
  if (b.goals !== 0) {
    result.push({
      label: 'Goals',
      formula: `${f2(i.goalsPer90)} xG/90 × ${share} × ${fixture} = ${f2(f.expectedGoals)} xG × ${i.goalPoints} pts`,
      result: pts(b.goals),
    });
  }
  if (b.assists !== 0) {
    result.push({
      label: 'Assists',
      formula: `${f2(i.assistsPer90)} xA/90 × ${share} × ${fixture} = ${f2(f.expectedAssists)} xA × ${i.assistPoints} pts`,
      result: pts(b.assists),
    });
  }
  const goalsAgainst =
    `${f2(i.leagueGoalsPerMatch)} league goals × ${f2(i.opponentAttack)} ${f.opponent} attack × ` +
    `${f2(i.clubDefence)} own defence ÷ ${venue} = ${f2(i.expectedGoalsAgainst)} goals against`;
  if (b.cleanSheet !== 0) {
    result.push({
      label: 'Clean sheet',
      formula: `${goalsAgainst} → ${pct(f.cleanSheetChance)} clean sheet × ${pct(i.sixtyMinuteChance)} plays 60′ × ${i.cleanSheetPoints} pts`,
      result: pts(b.cleanSheet),
    });
  }
  if (b.goalsConceded !== 0) {
    result.push({
      label: 'Goals conceded',
      formula: `−1 per 2 of ${f2(i.expectedGoalsAgainst)} goals against (Poisson) × ${pct(i.sixtyMinuteChance)} plays 60′`,
      result: pts(b.goalsConceded),
    });
  }
  if (position === 'GK' && b.saves !== 0) {
    result.push({
      label: 'Saves',
      formula: `${f2(i.savesPerMatch)} saves per match (vs ${f.opponent}'s attack) → 1 pt per 3 × ${pct(startChance)} start`,
      result: pts(b.saves),
    });
  }
  if (b.bonus !== 0) {
    result.push({
      label: 'Bonus',
      formula: `${f2(i.bonusPer90)} bonus/90 × ${share}${h2h}`,
      result: pts(b.bonus),
    });
  }
  if (i.defensiveThreshold !== null && b.defensiveContribution !== 0) {
    result.push({
      label: 'Defensive contribution',
      formula: `${f2(i.defensiveActionsPerMatch)} actions per match → ${pct(i.defensiveContributionChance)} chance of ${i.defensiveThreshold}+ × ${pct(startChance)} start × 2 pts`,
      result: pts(b.defensiveContribution),
    });
  }
  if (b.cards !== 0) {
    result.push({
      label: 'Cards',
      formula: `−${f2(i.cardPointsPer90)} card points/90 × ${share}`,
      result: pts(b.cards),
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
        How GW{gameweek} {fixture.opponent} ({fixture.isHome ? 'H' : 'A'}) adds up to {fixture.points.toFixed(2)}
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
