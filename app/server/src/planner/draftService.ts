// /api/planner/draft: the manager's one draft plan, replayed week by week on today's predictions.
// Stored in the draft_plan table (user data, never response-cached).
import { config } from '../config/index.js';
import { type DecisionContext, loadDecisionContext } from '../shared/decision/decisionContext.js';
import { transferOption } from '../shared/decision/transferOption.js';
import { candidatePool, searchTransfers } from '../shared/decision/transferSearch.js';
import { round2, sum, tenths } from '../shared/numbers.js';
import { groupByPosition, isAvailable } from '../shared/positions.js';
import type { Position } from '../team/models.js';
import { HttpError } from '../utils/http.js';
import { type SimulatedWeek, simulateDraft } from './draftPlan.js';
import { draftRepository } from './draftRepository.js';
import { lineupOf, marketPlayer } from './mappers.js';
import type { DraftPlanResponse, DraftWeek, MarketPlayer, PlannedTransfer } from './models.js';
import { forGameweeks } from './squadBuilder.js';

function simulate(context: DecisionContext, transfers: readonly PlannedTransfer[]) {
  return simulateDraft(
    { squad: context.squad, bank: context.bank, freeTransfers: context.freeTransfers.available },
    context.gameweeks,
    transfers,
    new Map(context.league.map((p) => [p.id, p])),
    {
      maxFreeTransfers: config.transfers.maxFreeTransfers,
      hitCost: config.transfers.hitCost,
      maxPerClub: config.transfers.maxPerClub,
    },
    (id) => context.players.get(id)?.webName ?? `player ${id}`,
  );
}

/** The best single transfer from week `w` of the plan for the rest of the horizon, or null. */
function nextMoveHint(context: DecisionContext, week: SimulatedWeek, w: number): DraftWeek['suggestion'] {
  const rest = forGameweeks(week.squad, w, context.gameweeks.length);
  const restLeague = forGameweeks(context.league, w, context.gameweeks.length);
  const topSale = Math.max(...rest.map((p) => p.price));
  const pool = candidatePool(restLeague, rest, week.bankAfter + topSale, config.transfers.candidatesPerPosition);
  const search = searchTransfers(rest, pool, {
    ...config.transfers,
    maxTransfers: 1,
    bank: week.bankAfter,
    freeTransfers: Math.max(0, week.freeTransfers - week.applied.length),
    optionsShown: 1,
  });
  return search.recommended.moves.length ? transferOption(search.recommended, search.baseline, context) : null;
}

/** The best available players per position over the horizon: what the draft form offers to buy. */
function market(context: DecisionContext): Record<Position, MarketPlayer[]> {
  const ranked = [...context.players.values()]
    .filter(isAvailable)
    .sort((a, b) => b.horizonPoints - a.horizonPoints);
  const grouped = groupByPosition(ranked);
  return Object.fromEntries(
    Object.entries(grouped).map(([position, players]) => [
      position,
      players.slice(0, config.planner.marketPerPosition).map((p) => marketPlayer(context, p.id)),
    ]),
  ) as Record<Position, MarketPlayer[]>;
}

function buildDraft(
  context: DecisionContext,
  transfers: readonly PlannedTransfer[],
  updatedAt: number | null,
  warnings: string[] = [],
): DraftPlanResponse {
  const { weeks, problems } = simulate(context, transfers);
  const leagueById = new Map(context.league.map((p) => [p.id, p]));
  const baseline = context.gameweeks.map((_, w) => lineupOf(context.squad, w).expectedPoints);

  const draftWeeks = weeks.map((week, w): DraftWeek => {
    const lineup = lineupOf(week.squad, w);
    return {
      gameweek: week.gameweek,
      moves: week.applied.map((t) => ({
        out: marketPlayer(context, t.outId),
        in: marketPlayer(context, t.inId),
        sellingPrice: tenths(week.sellingPrices.get(t.outId) ?? 0),
        buyingPrice: tenths(leagueById.get(t.inId)?.price ?? 0),
      })),
      freeTransfers: week.freeTransfers,
      hitCost: week.hitCost,
      bankAfter: tenths(week.bankAfter),
      squad: week.squad.map((p) => p.id),
      lineup,
      baselinePoints: baseline[w]!,
      netPoints: round2(lineup.expectedPoints - week.hitCost),
      suggestion: nextMoveHint(context, week, w),
    };
  });

  const totalPoints = round2(sum(draftWeeks.map((w) => w.netPoints)));
  const baselinePoints = round2(sum(baseline));
  return {
    gameweek: context.gameweek,
    gameweeks: context.gameweeks,
    transfers: weeks.flatMap((w) => w.applied),
    weeks: draftWeeks,
    totalPoints,
    baselinePoints,
    gain: round2(totalPoints - baselinePoints),
    warnings: [...warnings, ...problems.map((p) => p.reason)],
    squad: context.squad.map((p) => marketPlayer(context, p.id)),
    market: market(context),
    updatedAt: updatedAt === null ? null : new Date(updatedAt).toISOString(),
  };
}

/** Checks the shape of a PUT body; the FPL rules are checked by simulating it. */
function parseTransfers(body: unknown): PlannedTransfer[] {
  const list = (body as { transfers?: unknown } | null)?.transfers;
  if (!Array.isArray(list)) throw new HttpError(400, 'Expected { "transfers": [{ "gameweek", "outId", "inId" }] }');
  if (list.length > config.planner.maxDraftTransfers) {
    throw new HttpError(400, `A plan can hold at most ${config.planner.maxDraftTransfers} transfers`);
  }
  return list.map((t: unknown) => {
    const { gameweek, outId, inId } = (t ?? {}) as Record<string, unknown>;
    if (![gameweek, outId, inId].every((v) => Number.isInteger(v))) {
      throw new HttpError(400, 'Each transfer needs integer "gameweek", "outId" and "inId"');
    }
    return { gameweek: gameweek as number, outId: outId as number, inId: inId as number };
  });
}

export const draftService = {
  /** The saved draft plan, replayed on today's predictions. Moves for past gameweeks are dropped. */
  async getDraft(teamId: number = config.fpl.teamId): Promise<DraftPlanResponse> {
    const context = await loadDecisionContext(teamId, false);
    const saved = draftRepository.get(teamId);
    const transfers = saved?.transfers ?? [];
    const current = transfers.filter((t) => t.gameweek >= context.gameweek);
    const dropped = transfers.length - current.length;
    const warnings = dropped ? [`${dropped} planned transfer(s) for past gameweeks were dropped.`] : [];
    return buildDraft(context, current, saved?.updatedAt ?? null, warnings);
  },

  /** Replaces the draft plan. Rejects (400) a plan that breaks a rule, naming the first problem. */
  async saveDraft(body: unknown, teamId: number = config.fpl.teamId): Promise<DraftPlanResponse> {
    const transfers = parseTransfers(body);
    const context = await loadDecisionContext(teamId, false);
    const { problems } = simulate(context, transfers);
    if (problems.length) throw new HttpError(400, problems.map((p) => p.reason).join('; '));
    const updatedAt = draftRepository.save(teamId, transfers);
    return buildDraft(context, transfers, updatedAt);
  },

  async clearDraft(teamId: number = config.fpl.teamId): Promise<DraftPlanResponse> {
    draftRepository.clear(teamId);
    return buildDraft(await loadDecisionContext(teamId, false), [], null);
  },
};
