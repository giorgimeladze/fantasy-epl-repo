// Pure: plays a queue of planned transfers forward over the horizon, gameweek by gameweek, with
// the same rules as the Transfers page: like for like, budget, 3 per club, free transfers banked
// up to 5 and −4 for each one beyond them. A move that breaks a rule is reported and skipped.
import { freeTransfersAfter } from '../shared/decision/freeTransfers.js';
import type { SquadPlayer } from '../shared/decision/transferSearch.js';
import type { PlannedTransfer } from './models.js';

export interface DraftRules {
  maxFreeTransfers: number;
  hitCost: number;
  maxPerClub: number;
}

export interface SimulatedWeek {
  gameweek: number;
  applied: PlannedTransfer[];
  freeTransfers: number; // before this week's transfers
  hitCost: number;
  bankAfter: number; // tenths of £m
  squad: SquadPlayer[]; // after the transfers; bought players at today's price
  sellingPrices: Map<number, number>; // what each applied move's `out` sold for
}

export interface DraftProblem {
  transfer: PlannedTransfer;
  reason: string;
}

export function simulateDraft(
  start: { squad: readonly SquadPlayer[]; bank: number; freeTransfers: number },
  gameweeks: readonly number[],
  transfers: readonly PlannedTransfer[],
  league: ReadonlyMap<number, SquadPlayer>,
  rules: DraftRules,
  nameOf: (id: number) => string,
): { weeks: SimulatedWeek[]; problems: DraftProblem[] } {
  let squad = [...start.squad];
  let bank = start.bank;
  let free = start.freeTransfers;
  const problems: DraftProblem[] = [];
  const money = (tenths: number) => `£${(tenths / 10).toFixed(1)}m`;

  for (const t of transfers) {
    if (!gameweeks.includes(t.gameweek)) problems.push({ transfer: t, reason: `GW${t.gameweek} isn't in the plan` });
  }

  const weeks = gameweeks.map((gameweek): SimulatedWeek => {
    const applied: PlannedTransfer[] = [];
    const sellingPrices = new Map<number, number>();
    const freeTransfers = free;

    for (const t of transfers.filter((x) => x.gameweek === gameweek)) {
      const out = squad.find((p) => p.id === t.outId);
      const incoming = league.get(t.inId);
      const problem = (reason: string) => problems.push({ transfer: t, reason: `GW${gameweek}: ${reason}` });

      if (!out) {
        problem(`${nameOf(t.outId)} isn't in the squad by then`);
        continue;
      }
      if (!incoming) {
        problem(`unknown player ${t.inId}`);
        continue;
      }
      if (squad.some((p) => p.id === incoming.id)) {
        problem(`${nameOf(incoming.id)} is already in the squad`);
        continue;
      }
      if (incoming.position !== out.position) {
        const [outName, inName] = [nameOf(out.id), nameOf(incoming.id)];
        const position = out.position;
        problem(`${outName} (${position}) can only be replaced by a ${position}, not ${inName} (${incoming.position})`);
        continue;
      }
      const after = bank + out.price - incoming.price;
      if (after < 0) {
        problem(`can't afford ${nameOf(incoming.id)} for ${nameOf(out.id)} (${money(-after)} short)`);
        continue;
      }
      const clubCount = squad.filter((p) => p.club === incoming.club && p.id !== out.id).length + 1;
      if (clubCount > rules.maxPerClub) {
        problem(`${nameOf(incoming.id)} would make ${clubCount} ${incoming.club} players (max ${rules.maxPerClub})`);
        continue;
      }

      squad = [...squad.filter((p) => p.id !== out.id), incoming];
      bank = after;
      sellingPrices.set(out.id, out.price);
      applied.push(t);
    }

    free = freeTransfersAfter(freeTransfers, applied.length, rules.maxFreeTransfers);
    return {
      gameweek,
      applied,
      freeTransfers,
      hitCost: rules.hitCost * Math.max(0, applied.length - freeTransfers),
      bankAfter: bank,
      squad,
      sellingPrices,
    };
  });

  return { weeks, problems };
}
