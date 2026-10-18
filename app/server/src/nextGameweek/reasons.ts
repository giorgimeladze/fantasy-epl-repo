// Pure: short reasons for a player's prediction in the next gameweek, shown under each suggestion.
import type { PlayerProjection, PointsBreakdown } from '../projections/models.js';

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

export function lineupReasons(player: PlayerProjection): string[] {
  const gw = player.gameweeks[0];
  if (!gw) return [];
  if (gw.fixtures.length === 0) return [`No fixture in GW${gw.gameweek}`];

  const venue = (f: { opponent: string; isHome: boolean }) => `${f.opponent} (${f.isHome ? 'H' : 'A'})`;
  const reasons: string[] = [
    gw.fixtures.length > 1 ? `Double gameweek: ${gw.fixtures.map(venue).join(', ')}` : `vs ${venue(gw.fixtures[0]!)}`,
  ];

  const news = player.news ? ` (${player.news})` : '';
  if (player.status === 's') reasons.push(`Suspended${news}`);
  else if (player.status === 'u' || player.status === 'n') reasons.push(`Unavailable${news}`);
  else if (player.status !== 'a') reasons.push(`${player.chanceOfPlaying ?? 0}% chance of playing${news}`);
  else if (gw.playChance < LOW_PLAY_CHANCE) reasons.push(`rotation risk: ${pct(gw.playChance)} chance to play`);

  const sources = SOURCES.map(({ key, label }) => ({
    label,
    points: gw.fixtures.reduce((sum, f) => sum + f.breakdown[key], 0),
  }))
    .filter((s) => s.points >= MIN_SOURCE_POINTS)
    .sort((a, b) => b.points - a.points)
    .slice(0, MAX_SOURCES);
  for (const s of sources) reasons.push(`${s.label} ${s.points.toFixed(1)}`);

  for (const f of gw.fixtures) {
    if (f.headToHeadFactor >= 1 + NOTABLE_HEAD_TO_HEAD) reasons.push(`good record vs ${f.opponent}`);
    else if (f.headToHeadFactor <= 1 - NOTABLE_HEAD_TO_HEAD) reasons.push(`poor record vs ${f.opponent}`);
  }
  return reasons;
}
