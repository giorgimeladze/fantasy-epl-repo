// Pure: which chips are left, and what Bench Boost and Triple Captain would add each gameweek.
// Free Hit and Wildcard need a squad search (squadBuilder.ts); plannerService puts them together.
import type { FplChip, FplChipPlay } from '../fpl/models.js';
import { bestLineup, type Candidate } from '../shared/lineupOptimizer.js';
import type { ChipName, ChipStatus } from './models.js';

export const CHIP_LABELS: Record<ChipName, string> = {
  wildcard: 'Wildcard',
  freehit: 'Free Hit',
  bboost: 'Bench Boost',
  '3xc': 'Triple Captain',
};
const SEASON_GAMEWEEKS = 38;

/**
 * A chip is available if the window containing `gameweek` hasn't had it played. Without FPL's
 * chip list (older seasons), each chip is assumed to be once per season.
 */
export function chipStatus(
  name: ChipName,
  windows: readonly FplChip[] | undefined,
  played: readonly FplChipPlay[],
  gameweek: number,
): ChipStatus {
  const window = windows
    ? windows.find((c) => c.name === name && c.start_event <= gameweek && gameweek <= c.stop_event)
    : { start_event: 1, stop_event: SEASON_GAMEWEEKS };
  const playedIn = window
    ? played.find((p) => p.name === name && window.start_event <= p.event && p.event <= window.stop_event)
    : undefined;
  return {
    name,
    label: CHIP_LABELS[name],
    available: window !== undefined && playedIn === undefined,
    availableUntil: window?.stop_event ?? null,
    playedInGameweek: playedIn?.event ?? null,
  };
}

export interface LineupWeek {
  bench: Candidate[];
  benchPoints: number; // all four bench players
  autosubPoints: number; // already expected without the chip
  captain: Candidate;
  captainPoints: number; // the armband's extra (vice-captain covering included)
}

/** The best lineup for one gameweek's squad, with what Bench Boost and Triple Captain would add. */
export function lineupWeek(squad: readonly Candidate[]): LineupWeek {
  const best = bestLineup(squad);
  const byId = new Map(squad.map((c) => [c.id, c]));
  const bench = best.lineup.bench.map((id) => byId.get(id)!);
  return {
    bench,
    benchPoints: bench.reduce((sum, c) => sum + c.points, 0),
    autosubPoints: best.evaluation.autosubPoints,
    captain: byId.get(best.lineup.captainId)!,
    captainPoints: best.evaluation.captainPoints,
  };
}

/** Bench Boost scores the whole bench, minus what autosubs would have brought in anyway. */
export function benchBoostValue(week: LineupWeek): number {
  return week.benchPoints - week.autosubPoints;
}

/** Triple Captain adds the armband once more: the captain's points (the vice's if he doesn't play). */
export function tripleCaptainValue(week: LineupWeek): number {
  return week.captainPoints;
}
