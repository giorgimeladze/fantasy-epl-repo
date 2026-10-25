import { config } from '../config/index.js';
import { cachedResponse } from '../db/responseCache.js';
import { bestLineup, type Candidate, formationOf } from '../nextGameweek/lineupOptimizer.js';
import type { Position } from '../team/models.js';
import { loadTransferContext, type TransferContext } from '../transfers/transferContext.js';
import { candidatePool, searchTransfers, type SquadPlayer } from '../transfers/transferSearch.js';
import { searchFromContext, transferOption } from '../transfers/transferService.js';
import { HttpError } from '../utils/http.js';
import { benchBoostValue, chipStatus, lineupWeek, tripleCaptainValue } from './chips.js';
import { simulateDraft } from './draftPlan.js';
import { draftRepository } from './draftRepository.js';
import type {
  ChipAdvice,
  ChipStatus,
  ChipWeek,
  DraftLineup,
  DraftPlanResponse,
  MarketPlayer,
  PlannedTransfer,
  PlannerPlayer,
  PlannerResponse,
  RotationPair,
} from './models.js';
import { bestPairs, type ClubSeries } from './rotation.js';
import { buildBestSquad, forGameweeks } from './squadBuilder.js';

type PlannerSnapshot = Omit<PlannerResponse, 'cache'>;

// `+ 0` turns −0 into 0, so a JSON round trip (the cache) gives the same value.
const round2 = (value: number): number => Math.round(value * 100) / 100 + 0;
const tenths = (value: number): number => value / 10;
const pts = (value: number) => value.toFixed(1);
const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];
const EPSILON = 1e-9;

function candidatesFor(squad: readonly SquadPlayer[], week: number): Candidate[] {
  return squad.map((p) => ({
    id: p.id,
    position: p.position,
    points: p.gameweeks[week]?.points ?? 0,
    playChance: p.gameweeks[week]?.playChance ?? 0,
  }));
}

function plannerPlayer(context: TransferContext, id: number, points: number): PlannerPlayer {
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

const names = (players: readonly PlannerPlayer[]) => players.map((p) => `${p.webName} ${pts(p.points)}`).join(', ');

/** The chip's best gameweek in its window (value above 0), with the verdict line. */
function pickBest(status: ChipStatus, weeks: ChipWeek[], describe: (week: ChipWeek) => string) {
  if (!status.available) {
    return {
      bestGameweek: null,
      verdict: status.playedInGameweek
        ? `Already played in GW${status.playedInGameweek}.`
        : 'Not available in this part of the season.',
    };
  }
  const eligible = weeks.filter((w) => status.availableUntil === null || w.gameweek <= status.availableUntil);
  const best = eligible.reduce<ChipWeek | null>((top, w) => (w.value > (top?.value ?? 0) + EPSILON ? w : top), null);
  if (!best) return { bestGameweek: null, verdict: 'Adds nothing in the coming gameweeks.' };
  const deadline = status.availableUntil !== null ? ` Must be played by GW${status.availableUntil}.` : '';
  return { bestGameweek: best.gameweek, verdict: `${describe(best)}${deadline}` };
}

function chipAdvice(context: TransferContext): ChipAdvice[] {
  const { squad, league, gameweeks, bank, bootstrap, chipsPlayed, gameweek } = context;
  const status = (name: ChipStatus['name']) => chipStatus(name, bootstrap.chips, chipsPlayed, gameweek);
  const range = `GW${gameweeks[0]}–${gameweeks.at(-1)}`;
  const lineups = gameweeks.map((_, w) => lineupWeek(candidatesFor(squad, w)));
  const searchOptions = {
    maxPerClub: config.transfers.maxPerClub,
    candidatesPerPosition: config.planner.squadSearchCandidates,
    maxSteps: config.planner.squadSearchMaxSteps,
  };
  const fixturesOf = (id: number, w: number) => context.players.get(id)?.gameweeks[w]?.fixtures.length ?? 0;

  // Bench Boost.
  const bboost = status('bboost');
  const bboostWeeks = lineups.map((week, w): ChipWeek => {
    const bench = week.bench.map((c) => plannerPlayer(context, c.id, c.points));
    return {
      gameweek: gameweeks[w]!,
      value: round2(benchBoostValue(week)),
      explanation: `bench ${pts(week.benchPoints)} − ${pts(week.autosubPoints)} already expected from autosubs`,
      players: bench,
    };
  });

  // Triple Captain.
  const triple = status('3xc');
  const tripleWeeks = lineups.map((week, w): ChipWeek => {
    const doubled = fixturesOf(week.captain.id, w) > 1 ? ', double gameweek' : '';
    const captain = plannerPlayer(context, week.captain.id, week.captain.points);
    return {
      gameweek: gameweeks[w]!,
      value: round2(tripleCaptainValue(week)),
      explanation: `captain ${captain.webName} ${pts(week.captain.points)} once more${doubled} (vice-captain covering included)`,
      players: [captain],
    };
  });

  // Free Hit: the best squad for that one week, against yours.
  const freehit = status('freehit');
  const ownIds = new Set(squad.map((p) => p.id));
  const freehitWeeks = gameweeks.map((gw, w): ChipWeek => {
    const built = buildBestSquad(forGameweeks(squad, w, w + 1), forGameweeks(league, w, w + 1), bank, searchOptions);
    const [after, before] = [built.perGameweek[0] ?? 0, built.baseline[0] ?? 0];
    const blanks = squad.filter((p) => fixturesOf(p.id, w) === 0).length;
    return {
      gameweek: gw,
      value: round2(after - before),
      explanation: `Free Hit squad ${pts(after)} vs yours ${pts(before)}${blanks ? ` (${blanks} of yours without a fixture)` : ''}`,
      players: built.squad
        .filter((p) => !ownIds.has(p.id))
        .map((p) => plannerPlayer(context, p.id, p.gameweeks[0]?.points ?? 0)),
    };
  });

  // Wildcard: the best squad for the whole horizon, against yours and against the best normal transfers.
  const wildcard = status('wildcard');
  const built = buildBestSquad(squad, league, bank, searchOptions);
  const wildcardGain = built.perGameweek.reduce((a, b) => a + b, 0) - built.baseline.reduce((a, b) => a + b, 0);
  const bestTransfers = searchFromContext(context).recommended.netGain;
  const builtIds = new Set(built.squad.map((p) => p.id));
  const horizon = (p: SquadPlayer) => p.gameweeks.reduce((sum, g) => sum + g.points, 0);
  const wildcardWeeks = gameweeks.map((gw, w): ChipWeek => ({
    gameweek: gw,
    value: round2((built.perGameweek[w] ?? 0) - (built.baseline[w] ?? 0)),
    explanation: `Wildcard squad ${pts(built.perGameweek[w] ?? 0)} vs yours ${pts(built.baseline[w] ?? 0)}`,
    players: [],
  }));
  const extra = wildcardGain - bestTransfers;
  const wildcardVerdict = !wildcard.available
    ? wildcard.playedInGameweek
      ? `Already played in GW${wildcard.playedInGameweek}.`
      : 'Not available in this part of the season.'
    : extra >= config.planner.wildcardMinGain
      ? `Worth considering now: ${pts(wildcardGain)} over ${range}, ${pts(extra)} more than the best transfers.`
      : `Not yet: ${pts(wildcardGain)} over ${range}, only ${pts(extra)} more than the best transfers (needs ${config.planner.wildcardMinGain}).`;

  const bboostBest = pickBest(
    bboost,
    bboostWeeks,
    (w) => `Best in GW${w.gameweek}: +${pts(w.value)} (${names(w.players)}).`,
  );
  const tripleBest = pickBest(
    triple,
    tripleWeeks,
    (w) => `Best in GW${w.gameweek}: +${pts(w.value)} with ${w.players[0]?.webName}.`,
  );
  const freehitBest = pickBest(freehit, freehitWeeks, (w) => `Best in GW${w.gameweek}: +${pts(w.value)}.`);

  return [
    {
      chip: wildcard,
      bestGameweek: wildcard.available && extra >= config.planner.wildcardMinGain ? gameweek : null,
      verdict: wildcardVerdict,
      method: `Builds the best squad for ${range} from your budget (bank + selling prices) by repeated best transfers, then compares it with your squad and with the Transfers page's recommendation. Suggested when it adds ${config.planner.wildcardMinGain}+ points more than those transfers (a rule of thumb).`,
      weeks: wildcardWeeks,
      wildcard: {
        in: built.squad.filter((p) => !ownIds.has(p.id)).map((p) => plannerPlayer(context, p.id, horizon(p))),
        out: squad.filter((p) => !builtIds.has(p.id)).map((p) => plannerPlayer(context, p.id, horizon(p))),
        gain: round2(wildcardGain),
        bestTransfersGain: round2(bestTransfers),
        bankAfter: tenths(built.bank),
      },
    },
    {
      chip: freehit,
      ...freehitBest,
      method:
        'For each gameweek, the best squad for that week alone from your budget, against your squad. Biggest in blank gameweeks.',
      weeks: freehitWeeks,
    },
    {
      chip: bboost,
      ...bboostBest,
      method:
        "Your best lineup each gameweek: the bench players' predicted points, minus what automatic substitutions would bring in anyway.",
      weeks: bboostWeeks,
    },
    {
      chip: triple,
      ...tripleBest,
      method:
        "Your best captain each gameweek scores once more (if he doesn't play, the vice-captain's points count). Double gameweeks add both fixtures.",
      weeks: tripleWeeks,
    },
  ];
}

function rotation(context: TransferContext): PlannerResponse['rotation'] {
  const { gameweeks, players } = context;
  const count = config.planner.rotationPairsShown;
  const byClub = new Map<string, typeof everyone>();
  const everyone = [...players.values()];
  for (const p of everyone) byClub.set(p.clubShortName, [...(byClub.get(p.clubShortName) ?? []), p]);

  // Goalkeepers: each club's first choice (most predicted points over the horizon).
  const keepers = new Map(
    [...byClub].flatMap(([club, list]) => {
      const keeper = list
        .filter((p) => p.position === 'GK' && p.status !== 'u' && p.status !== 'n')
        .sort((a, b) => b.horizonPoints - a.horizonPoints)[0];
      return keeper ? [[club, keeper] as const] : [];
    }),
  );
  const keeperSeries: ClubSeries[] = [...keepers].map(([club, k]) => ({
    club,
    values: k.gameweeks.map((g) => g.points),
  }));
  const { rotationMinStarts, goalkeeperPairMaxPrice } = config.planner;
  const affordable = (a: ClubSeries, b: ClubSeries) =>
    keepers.get(a.club)!.price + keepers.get(b.club)!.price <= goalkeeperPairMaxPrice + EPSILON;
  const goalkeepers: RotationPair[] = bestPairs(keeperSeries, gameweeks, count, rotationMinStarts, affordable).map(
    (pair) => {
      const pairKeepers = pair.clubs.map((club) => keepers.get(club)!);
      return {
        ...pair,
        players: pairKeepers.map((k) => plannerPlayer(context, k.id, k.horizonPoints)),
        price: round2(pairKeepers.reduce((sum, k) => sum + k.price, 0)),
      };
    },
  );

  // Defences: expected clean sheets per gameweek (every player at a club shares its fixtures).
  const defenceSeries: ClubSeries[] = [...byClub].map(([club, list]) => ({
    club,
    values: gameweeks.map((_, w) =>
      (list[0]?.gameweeks[w]?.fixtures ?? []).reduce((sum, f) => sum + f.cleanSheetChance, 0),
    ),
  }));
  const defences: RotationPair[] = bestPairs(defenceSeries, gameweeks, count, rotationMinStarts).map((pair) => ({
    ...pair,
    players: [],
    price: 0,
  }));

  return { goalkeepers, defences };
}

async function buildPlanner(teamId: number, forceRefresh: boolean): Promise<PlannerSnapshot> {
  const context = await loadTransferContext(teamId, forceRefresh);
  return {
    gameweek: context.gameweek,
    gameweeks: context.gameweeks,
    chips: chipAdvice(context),
    rotation: rotation(context),
  };
}

// ── Draft plan ────────────────────────────────────────────────────────────────

function marketPlayer(context: TransferContext, id: number): MarketPlayer {
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

function lineupOf(squad: readonly SquadPlayer[], week: number): DraftLineup {
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

function simulate(context: TransferContext, transfers: readonly PlannedTransfer[]) {
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

function buildDraft(
  context: TransferContext,
  transfers: readonly PlannedTransfer[],
  updatedAt: number | null,
  warnings: string[] = [],
): DraftPlanResponse {
  const { weeks, problems } = simulate(context, transfers);
  const { gameweeks, league } = context;
  const leagueById = new Map(league.map((p) => [p.id, p]));
  const baseline = gameweeks.map((_, w) => lineupOf(context.squad, w).expectedPoints);

  const draftWeeks = weeks.map((week, w) => {
    const lineup = lineupOf(week.squad, w);

    // The best single transfer from here for the rest of the horizon.
    const rest = forGameweeks(week.squad, w, gameweeks.length);
    const restLeague = forGameweeks(league, w, gameweeks.length);
    const topSale = Math.max(...rest.map((p) => p.price));
    const freeLeft = Math.max(0, week.freeTransfers - week.applied.length);
    const pool = candidatePool(restLeague, rest, week.bankAfter + topSale, config.transfers.candidatesPerPosition);
    const search = searchTransfers(rest, pool, {
      ...config.transfers,
      maxTransfers: 1,
      bank: week.bankAfter,
      freeTransfers: freeLeft,
      optionsShown: 1,
    });

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
      suggestion: search.recommended.moves.length ? transferOption(search.recommended, search.baseline, context) : null,
    };
  });

  const totalPoints = round2(draftWeeks.reduce((sum, w) => sum + w.netPoints, 0));
  const baselinePoints = round2(baseline.reduce((a, b) => a + b, 0));
  const market = Object.fromEntries(
    POSITIONS.map((position) => [
      position,
      [...context.players.values()]
        .filter((p) => p.position === position && p.status !== 'u' && p.status !== 'n')
        .sort((a, b) => b.horizonPoints - a.horizonPoints)
        .slice(0, config.planner.marketPerPosition)
        .map((p) => marketPlayer(context, p.id)),
    ]),
  ) as Record<Position, MarketPlayer[]>;

  return {
    gameweek: context.gameweek,
    gameweeks,
    transfers: weeks.flatMap((w) => w.applied),
    weeks: draftWeeks,
    totalPoints,
    baselinePoints,
    gain: round2(totalPoints - baselinePoints),
    warnings: [...warnings, ...problems.map((p) => p.reason)],
    squad: context.squad.map((p) => marketPlayer(context, p.id)),
    market,
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

export const plannerService = {
  /** Chip timing and rotation pairs over the horizon. Cached in SQLite for config.db.cacheTtlMs. */
  getPlanner(
    teamId: number = config.fpl.teamId,
    { forceRefresh = false }: { forceRefresh?: boolean } = {},
  ): Promise<PlannerResponse> {
    return cachedResponse(`planner:${teamId}`, config.db.cacheTtlMs, forceRefresh, () =>
      buildPlanner(teamId, forceRefresh),
    );
  },

  /** The saved draft plan, replayed on today's predictions. Moves for past gameweeks are dropped. */
  async getDraft(teamId: number = config.fpl.teamId): Promise<DraftPlanResponse> {
    const context = await loadTransferContext(teamId, false);
    const saved = draftRepository.get(teamId);
    const transfers = saved?.transfers ?? [];
    const current = transfers.filter((t) => t.gameweek >= context.gameweek);
    const warnings =
      current.length < transfers.length
        ? [`${transfers.length - current.length} planned transfer(s) for past gameweeks were dropped.`]
        : [];
    return buildDraft(context, current, saved?.updatedAt ?? null, warnings);
  },

  /** Replaces the draft plan. Rejects (400) a plan that breaks a rule, naming the first problem. */
  async saveDraft(body: unknown, teamId: number = config.fpl.teamId): Promise<DraftPlanResponse> {
    const transfers = parseTransfers(body);
    const context = await loadTransferContext(teamId, false);
    const { problems } = simulate(context, transfers);
    if (problems.length) throw new HttpError(400, problems.map((p) => p.reason).join('; '));
    const updatedAt = draftRepository.save(teamId, transfers);
    return buildDraft(context, transfers, updatedAt);
  },

  async clearDraft(teamId: number = config.fpl.teamId): Promise<DraftPlanResponse> {
    draftRepository.clear(teamId);
    return buildDraft(await loadTransferContext(teamId, false), [], null);
  },
};
