// Pure: short reasons for a player's prediction in the next gameweek, shown under each suggestion.
// The phrase helpers are shared with transfers/ (which explains a whole horizon).
import type { FixtureProjection, PlayerProjection, PointsBreakdown } from '../projections/models.js';

const SOURCES: Array<{ key: keyof PointsBreakdown; label: string }> = [
  { key: 'goals', label: 'goals' },
  { key: 'assists', label: 'assists' },
  { key: 'cleanSheet', label: 'clean sheet' },
  { key: 'saves', label: 'saves' },
  { key: 'bonus', label: 'bonus' },
  { key: 'defensiveContribution', label: 'defensive contribution' },
];

const MIN_SOURCE_POINTS = 0.3;
const MAX_SOURCES = 2;
const LOW_PLAY_CHANCE = 0.75;
const NOTABLE_HEAD_TO_HEAD = 0.03; // factor at least ±3 %

const pct = (value: number) => `${Math.round(value * 100)}%`;

/** FPL's availability flag with the news, or "rotation risk" when the model's play chance is low. */
export function availabilityReason(player: PlayerProjection, playChance: number): string | null {
  const news = player.news ? ` (${player.news})` : '';
  if (player.status === 's') return `Suspended${news}`;
  if (player.status === 'u' || player.status === 'n') return `Unavailable${news}`;
  if (player.status !== 'a') return `${player.chanceOfPlaying ?? 0}% chance of playing${news}`;
  if (playChance < LOW_PLAY_CHANCE) return `rotation risk: ${pct(playChance)} chance to play`;
  return null;
}

/** The biggest sources of predicted points across `fixtures`, e.g. "goals 1.9". */
export function sourceReasons(fixtures: readonly FixtureProjection[]): string[] {
  return SOURCES.map(({ key, label }) => ({
    label,
    points: fixtures.reduce((sum, f) => sum + f.breakdown[key], 0),
  }))
    .filter((s) => s.points >= MIN_SOURCE_POINTS)
    .sort((a, b) => b.points - a.points)
    .slice(0, MAX_SOURCES)
    .map((s) => `${s.label} ${s.points.toFixed(1)}`);
}

/** Opponents with a notable head-to-head record, each listed once. */
export function headToHeadRecords(fixtures: readonly FixtureProjection[]): { good: string[]; poor: string[] } {
  const good = new Set<string>();
  const poor = new Set<string>();
  for (const f of fixtures) {
    if (f.headToHeadFactor >= 1 + NOTABLE_HEAD_TO_HEAD) good.add(f.opponent);
    else if (f.headToHeadFactor <= 1 - NOTABLE_HEAD_TO_HEAD) poor.add(f.opponent);
  }
  return { good: [...good], poor: [...poor] };
}

/** "good record vs WOL" / "poor record vs WOL"; several opponents are listed together. */
export function headToHeadReasons(fixtures: readonly FixtureProjection[]): string[] {
  const { good, poor } = headToHeadRecords(fixtures);
  return [
    ...(good.length ? [`good record vs ${good.join(', ')}`] : []),
    ...(poor.length ? [`poor record vs ${poor.join(', ')}`] : []),
  ];
}

export const venue = (f: { opponent: string; isHome: boolean }) => `${f.opponent} (${f.isHome ? 'H' : 'A'})`;

export function lineupReasons(player: PlayerProjection): string[] {
  const gw = player.gameweeks[0];
  if (!gw) return [];
  if (gw.fixtures.length === 0) return [`No fixture in GW${gw.gameweek}`];

  const reasons: string[] = [
    gw.fixtures.length > 1 ? `Double gameweek: ${gw.fixtures.map(venue).join(', ')}` : `vs ${venue(gw.fixtures[0]!)}`,
  ];
  const availability = availabilityReason(player, gw.playChance);
  if (availability) reasons.push(availability);
  reasons.push(...sourceReasons(gw.fixtures), ...headToHeadReasons(gw.fixtures));
  return reasons;
}
