// Pure: reads FPL's own price-change outlook for a player. The fields are undocumented; FPL
// publishes a likelihood from −5 to 5 for each of the next price updates (offset 0 = tonight).
import type { FplElement } from '../fpl/models.js';

const LIKELY = 3;
const POSSIBLE = 2;

export interface PriceOutlook {
  direction: 'rise' | 'fall';
  chance: 'likely' | 'possible';
  updatesAway: number;
  progressPercent: number;
}

/** Whether FPL is publishing price-change data at all. */
export function hasPriceData(elements: readonly FplElement[]): boolean {
  return elements.some((e) => e.price_change_projections !== undefined);
}

/** The first upcoming price update FPL rates at least "possible", or null. Locked prices can't change. */
export function priceOutlook(element: FplElement, now: number): PriceOutlook | null {
  const projections = element.price_change_projections;
  if (!projections?.length) return null;
  const lockedUntil = element.price_change_locked_until ? Date.parse(element.price_change_locked_until) : NaN;
  if (lockedUntil > now) return null;

  const upcoming = [...projections].sort((a, b) => a.offset - b.offset);
  const pick =
    upcoming.find((p) => Math.abs(p.likelihood) >= LIKELY) ?? upcoming.find((p) => Math.abs(p.likelihood) >= POSSIBLE);
  if (!pick) return null;

  return {
    direction: pick.likelihood > 0 ? 'rise' : 'fall',
    chance: Math.abs(pick.likelihood) >= LIKELY ? 'likely' : 'possible',
    updatesAway: pick.offset,
    progressPercent: Number.parseFloat(element.price_change_percent ?? '') || 0,
  };
}
