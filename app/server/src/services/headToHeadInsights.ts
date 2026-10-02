import type {
  FixtureRecord,
  HeadToHeadMatch,
  HeadToHeadSummary,
  Insight,
  Verdict,
} from '../models/headToHead.js';
import type { Position } from '../models/team.js';

// Average points per meeting that count as a good / poor record against an opponent.
const GOOD_AVERAGE = 6;
const POOR_AVERAGE = 3;

// FPL 2025-26 rule: 2 points for 10 defensive actions (defenders) or 12 (midfielders/forwards).
const DEFENSIVE_CONTRIBUTION_THRESHOLD: Partial<Record<Position, number>> = { DEF: 10, MID: 12, FWD: 12 };

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : `${n} ${many}`);

export function matchResult(record: FixtureRecord): HeadToHeadMatch['result'] {
  if (record.teamHScore === null || record.teamAScore === null) return null;
  const [scored, conceded] = record.wasHome
    ? [record.teamHScore, record.teamAScore]
    : [record.teamAScore, record.teamHScore];
  if (scored > conceded) return 'W';
  if (scored < conceded) return 'L';
  return 'D';
}

/** What earned or cost the player points in one fixture, using FPL scoring rules for their position. */
export function matchInsights(record: FixtureRecord, position: Position): Insight[] {
  const good: Insight[] = [];
  const bad: Insight[] = [];
  const defensive = position === 'GK' || position === 'DEF';

  if (record.goals > 0) good.push({ label: plural(record.goals, 'Goal', 'goals'), tone: 'good' });
  if (record.assists > 0) good.push({ label: plural(record.assists, 'Assist', 'assists'), tone: 'good' });
  if (record.cleanSheets > 0 && position !== 'FWD') good.push({ label: 'Clean sheet', tone: 'good' });
  if (record.bonus > 0) good.push({ label: `+${record.bonus} bonus`, tone: 'good' });
  if (position === 'GK' && record.saves >= 3) good.push({ label: `${record.saves} saves`, tone: 'good' });
  if (record.penaltiesSaved > 0) good.push({ label: 'Penalty saved', tone: 'good' });

  const dcThreshold = DEFENSIVE_CONTRIBUTION_THRESHOLD[position];
  if (dcThreshold && record.defensiveContribution !== null && record.defensiveContribution >= dcThreshold) {
    good.push({ label: 'Defensive contribution', tone: 'good' });
  }

  if (record.minutes < 60) bad.push({ label: `Only ${record.minutes}'`, tone: 'bad' });
  if (defensive && record.goalsConceded >= 2) bad.push({ label: `Conceded ${record.goalsConceded}`, tone: 'bad' });
  if (record.yellowCards > 0) bad.push({ label: 'Yellow card', tone: 'bad' });
  if (record.redCards > 0) bad.push({ label: 'Red card', tone: 'bad' });
  if (record.ownGoals > 0) bad.push({ label: plural(record.ownGoals, 'Own goal', 'own goals'), tone: 'bad' });
  if (record.penaltiesMissed > 0) bad.push({ label: 'Missed penalty', tone: 'bad' });
  if (good.length === 0 && record.totalPoints <= 2) bad.push({ label: 'Blank', tone: 'bad' });

  return [...good, ...bad];
}

export function toMatch(record: FixtureRecord, position: Position): HeadToHeadMatch {
  const { playerCode: _playerCode, opponentCode: _opponentCode, ...rest } = record;
  return { ...rest, result: matchResult(record), insights: matchInsights(record, position) };
}

export function summarize(matches: readonly HeadToHeadMatch[]): HeadToHeadSummary {
  const sum = (pick: (m: HeadToHeadMatch) => number): number => matches.reduce((acc, m) => acc + pick(m), 0);
  const totalPoints = sum((m) => m.totalPoints);
  const averagePoints = matches.length ? Math.round((totalPoints / matches.length) * 10) / 10 : 0;

  let verdict: Verdict = 'none';
  if (matches.length > 0) {
    verdict = averagePoints >= GOOD_AVERAGE ? 'good' : averagePoints < POOR_AVERAGE ? 'poor' : 'average';
  }

  return {
    matches: matches.length,
    averagePoints,
    totalPoints,
    goals: sum((m) => m.goals),
    assists: sum((m) => m.assists),
    cleanSheets: sum((m) => m.cleanSheets),
    bonus: sum((m) => m.bonus),
    cards: sum((m) => m.yellowCards + m.redCards),
    verdict,
  };
}
