// Pure: reads FPL's own price-change outlook for a player. The fields are undocumented; FPL
// publishes a likelihood from −5 to 5 for each of the next price updates (offset 0 = tonight).
import type { FplBootstrap, FplElement } from '../fpl/models.js';
import { decimal, tenths } from '../shared/numbers.js';
import { positionFromCode } from '../shared/positions.js';
import type { PriceHint, PriceWatch } from './models.js';

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
    progressPercent: decimal(element.price_change_percent),
  };
}

/** The squad's likely price changes, and the `perList` league-wide risers and fallers due soonest. */
export function priceWatch(
  bootstrap: FplBootstrap,
  squadIds: ReadonlySet<number>,
  now: number,
  perList: number,
): PriceWatch {
  if (!hasPriceData(bootstrap.elements)) return { available: false, squad: [], risers: [], fallers: [] };

  const clubs = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));
  const positions = new Map(bootstrap.element_types.map((t) => [t.id, positionFromCode(t.singular_name_short)]));
  const hints: PriceHint[] = bootstrap.elements.flatMap((e) => {
    const outlook = priceOutlook(e, now);
    if (!outlook) return [];
    return [
      {
        id: e.id,
        webName: e.web_name,
        position: positions.get(e.element_type) ?? 'MID',
        clubShortName: clubs.get(e.team) ?? '?',
        price: tenths(e.now_cost),
        ...outlook,
        netTransfers: e.transfers_in_event - e.transfers_out_event,
        changeThisGameweek: tenths(e.cost_change_event),
        inSquad: squadIds.has(e.id),
      },
    ];
  });

  // Soonest first, then furthest along.
  const order = (a: PriceHint, b: PriceHint) =>
    a.updatesAway - b.updatesAway || Math.abs(b.progressPercent) - Math.abs(a.progressPercent);
  const league = (direction: PriceHint['direction']) =>
    hints
      .filter((h) => h.direction === direction && h.chance === 'likely')
      .sort(order)
      .slice(0, perList);

  return {
    available: true,
    squad: hints.filter((h) => h.inSquad).sort(order),
    risers: league('rise'),
    fallers: league('fall'),
  };
}
