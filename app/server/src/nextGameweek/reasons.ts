// Pure: short reasons for a player's prediction in the next gameweek, shown under each suggestion.
import type { PlayerProjection } from '../projections/models.js';
import { availabilityReason, headToHeadReasons, sourceReasons, venue } from '../shared/playerReasons.js';

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
