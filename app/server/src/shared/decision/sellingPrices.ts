// Pure: what each squad player sells for, estimated from the public transfer list (the exact
// figure is only on /my-team, which needs the manager's FPL login). All prices in tenths of £m.
//
// FPL rule: you get the purchase price plus half of any rise, rounded down to £0.1m; a fall is
// passed on in full.
import type { FplElement, FplTransfer } from '../../fpl/models.js';

export interface SellingPrice {
  purchasePrice: number;
  sellingPrice: number;
  /** The gameweek of the transfer that brought them in; null = in the first squad. */
  boughtInGameweek: number | null;
}

export function sellingPriceOf(purchasePrice: number, nowCost: number): number {
  return nowCost <= purchasePrice ? nowCost : purchasePrice + Math.floor((nowCost - purchasePrice) / 2);
}

/**
 * Players with no transfer in were in the first squad: their purchase price is taken as the
 * season's starting price (now_cost − cost_change_start). That is exact for managers who joined
 * in GW1, and close otherwise.
 */
export function sellingPrice(element: FplElement, transfers: readonly FplTransfer[]): SellingPrice {
  const latestIn = transfers
    .filter((t) => t.element_in === element.id)
    .sort((a, b) => b.event - a.event || Date.parse(b.time) - Date.parse(a.time))[0];
  const purchasePrice = latestIn?.element_in_cost ?? element.now_cost - element.cost_change_start;
  return {
    purchasePrice,
    sellingPrice: sellingPriceOf(purchasePrice, element.now_cost),
    boughtInGameweek: latestIn?.event ?? null,
  };
}
