// Pure: free transfers for the next gameweek, replayed from /entry/{id}/history/. FPL only shows the
// count to the logged-in manager (/my-team), so it is worked out from the public history instead.
//
// Rules (since 2024-25): 1 free transfer per gameweek, banked up to 5. The first gameweek's squad is
// free. A Wildcard or Free Hit uses no free transfers and keeps the bank as it was (no +1 that week).
import type { FplChipPlay, FplEntryHistory } from '../fpl/models.js';
import type { FreeTransferWeek } from './models.js';

const BANK_KEEPING_CHIPS = new Set(['wildcard', 'freehit']);

export interface FreeTransferCount {
  available: number;
  weeks: FreeTransferWeek[]; // oldest first
}

/** Free transfers the next week, after making `used` this week from `available`. */
export function freeTransfersAfter(available: number, used: number, max: number): number {
  return Math.min(max, Math.max(0, available - used) + 1);
}

export function countFreeTransfers(
  history: readonly FplEntryHistory[],
  chips: readonly FplChipPlay[],
  max: number,
): FreeTransferCount {
  const chipByGameweek = new Map(chips.map((c) => [c.event, c.name]));
  const played = [...history].sort((a, b) => a.event - b.event);

  let available = 0;
  const weeks = played.map((gw, i): FreeTransferWeek => {
    const chip = chipByGameweek.get(gw.event) ?? null;
    if (i === 0)
      available = 1; // picking the first squad is free
    else if (!(chip && BANK_KEEPING_CHIPS.has(chip)))
      available = freeTransfersAfter(available, gw.event_transfers, max);
    return { gameweek: gw.event, transfers: gw.event_transfers, chip, freeAfter: available };
  });
  return { available, weeks };
}
