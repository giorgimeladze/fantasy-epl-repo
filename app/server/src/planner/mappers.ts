// Response views shared by the planner and the draft plan, built from a decision context.
import { bestLineup, type Candidate, formationOf } from '../shared/lineupOptimizer.js';
import type { DecisionContext } from '../shared/decision/decisionContext.js';
import type { SquadPlayer } from '../shared/decision/transferSearch.js';
import { round2 } from '../shared/numbers.js';
import type { DraftLineup, MarketPlayer, PlannerPlayer } from './models.js';

/** Predicted points with one decimal, for verdicts and explanations. */
export const pts = (value: number): string => value.toFixed(1);

/** The squad as lineup candidates for gameweek `week` (an index into the horizon). */
export function candidatesFor(squad: readonly SquadPlayer[], week: number): Candidate[] {
  return squad.map((p) => ({
    id: p.id,
    position: p.position,
    points: p.gameweeks[week]?.points ?? 0,
    playChance: p.gameweeks[week]?.playChance ?? 0,
  }));
}

export function plannerPlayer(context: DecisionContext, id: number, points: number): PlannerPlayer {
  const p = context.players.get(id)!;
  return {
    id,
    webName: p.webName,
    position: p.position,
    clubShortName: p.clubShortName,
    price: p.price,
    points: round2(points),
  };
}

export function marketPlayer(context: DecisionContext, id: number): MarketPlayer {
  const p = context.players.get(id)!;
  return {
    id,
    webName: p.webName,
    position: p.position,
    clubShortName: p.clubShortName,
    price: p.price,
    gameweekPoints: p.gameweeks.map((g) => g.points),
    horizonPoints: p.horizonPoints,
  };
}

/** The best lineup of `squad` in gameweek `week` (an index into the horizon). */
export function lineupOf(squad: readonly SquadPlayer[], week: number): DraftLineup {
  const candidates = candidatesFor(squad, week);
  const best = bestLineup(candidates);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  return {
    formation: formationOf(best.lineup.starters.map((id) => byId.get(id)!)),
    captainId: best.lineup.captainId,
    expectedPoints: round2(best.evaluation.expectedPoints),
    startersPoints: round2(best.evaluation.startersPoints),
    captainPoints: round2(best.evaluation.captainPoints),
    autosubPoints: round2(best.evaluation.autosubPoints),
  };
}
