// Pure: short reasons for a player's prediction over the planning horizon, shown with each transfer.
import { availabilityReason, headToHeadReasons, sourceReasons, venue } from '../playerReasons.js';
import type { PlayerProjection } from '../../projections/models.js';

/** Fixtures per gameweek ("LIV (H), blank, CHE (H) + ARS (A)"), form, availability, point sources, head-to-head. */
export function transferReasons(player: PlayerProjection, form: number): string[] {
  const fixtures = player.gameweeks.flatMap((g) => g.fixtures);
  const schedule = player.gameweeks
    .map((g) => (g.fixtures.length === 0 ? 'blank' : g.fixtures.map(venue).join(' + ')))
    .join(', ');

  const reasons = [`fixtures: ${schedule}`, `form ${form.toFixed(1)}`];
  const availability = availabilityReason(player, player.gameweeks[0]?.playChance ?? 0);
  if (availability) reasons.push(availability);
  reasons.push(...sourceReasons(fixtures), ...headToHeadReasons(fixtures));
  return reasons;
}
