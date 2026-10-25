// Pure: the best squad money can buy for some gameweeks (Free Hit: one week, Wildcard: the horizon).
// No solver: starting from the manager's squad, it keeps making the best free transfer (or pair,
// when no single one helps) until nothing adds points. That respects the budget, positions and the
// club limit at every step, and lands on a squad no 1- or 2-transfer change can improve.
import { candidatePool, searchTransfers, type SquadPlayer } from '../shared/decision/transferSearch.js';

export interface SquadSearchOptions {
  maxPerClub: number;
  candidatesPerPosition: number;
  maxSteps: number;
}

export interface BuiltSquad {
  squad: SquadPlayer[];
  bank: number; // tenths of £m left
  perGameweek: number[]; // the built squad's points per gameweek
  baseline: number[]; // the starting squad's
  steps: number; // transfers made
}

/** Keeps only gameweeks `from` to `to` (exclusive) of each player's projection. */
export function forGameweeks(players: readonly SquadPlayer[], from: number, to: number): SquadPlayer[] {
  return players.map((p) => ({ ...p, gameweeks: p.gameweeks.slice(from, to) }));
}

export function buildBestSquad(
  start: readonly SquadPlayer[],
  league: readonly SquadPlayer[],
  bank: number,
  options: SquadSearchOptions,
): BuiltSquad {
  const byId = new Map(league.map((p) => [p.id, p]));
  let squad = [...start];
  let money = bank;
  let baseline: number[] | null = null;
  let perGameweek: number[] = [];
  let steps = 0;

  for (let step = 0; step < options.maxSteps; step++) {
    const budget = money + squad.reduce((sum, p) => sum + p.price, 0);
    const pool = candidatePool(league, squad, budget, options.candidatesPerPosition);
    const rules = {
      bank: money,
      freeTransfers: 2,
      maxFreeTransfers: 2,
      hitCost: 0,
      maxPerClub: options.maxPerClub,
      savedTransferValue: 0,
      optionsShown: 1,
    };
    // Singles first: much cheaper, and enough for most steps.
    let result = searchTransfers(squad, pool, { ...rules, maxTransfers: 1 });
    if (result.recommended.moves.length === 0) result = searchTransfers(squad, pool, { ...rules, maxTransfers: 2 });
    baseline ??= result.baseline;
    perGameweek = result.recommended.perGameweek;

    const { moves } = result.recommended;
    if (moves.length === 0) break;
    const out = new Set(moves.map((m) => m.outId));
    squad = [...squad.filter((p) => !out.has(p.id)), ...moves.map((m) => byId.get(m.inId)!)];
    money = result.recommended.bankAfter;
    steps += moves.length;
  }

  return { squad, bank: money, perGameweek, baseline: baseline ?? perGameweek, steps };
}
