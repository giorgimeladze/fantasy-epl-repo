import { config } from '../config/index.js';
import { cachedResponse } from '../db/responseCache.js';
import { fplClient } from '../fpl/fplClient.js';
import type { FplBootstrap } from '../fpl/models.js';
import type { PlayerProjection } from '../projections/models.js';
import { projectionService } from '../projections/projectionService.js';
import type { Position } from '../team/models.js';
import { teamService } from '../team/teamService.js';
import { HttpError } from '../utils/http.js';
import {
  bestCaptaincy,
  bestLineup,
  bestVice,
  type Candidate,
  captainPoints,
  evaluate,
  formationOf,
  type Lineup,
  lineupChanges,
} from './lineupOptimizer.js';
import type {
  CaptainOption,
  LineupChoice,
  LineupPlayer,
  NextGameweekResponse,
  PriceHint,
  PriceWatch,
} from './models.js';
import { hasPriceData, priceOutlook } from './priceWatch.js';
import { lineupReasons } from './reasons.js';

type NextGameweekSnapshot = Omit<NextGameweekResponse, 'cache'>;

// `+ 0` turns −0 into 0, so a JSON round trip (the cache) gives the same value.
const round2 = (value: number): number => Math.round(value * 100) / 100 + 0;
const POSITION_ORDER: Record<Position, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

function toLineupPlayer(p: PlayerProjection): LineupPlayer {
  const gw = p.gameweeks[0];
  return {
    id: p.id,
    webName: p.webName,
    position: p.position,
    clubShortName: p.clubShortName,
    points: gw?.points ?? 0,
    playChance: gw?.playChance ?? 0,
    status: p.status,
    news: p.news,
    fixtures: (gw?.fixtures ?? []).map((f) => ({ opponent: f.opponent, isHome: f.isHome, difficulty: f.difficulty })),
    reasons: lineupReasons(p),
  };
}

function choice(lineup: Lineup, players: Map<number, LineupPlayer>, candidates: Map<number, Candidate>): LineupChoice {
  const evaluation = evaluate(lineup, candidates);
  const starters = lineup.starters
    .map((id) => players.get(id)!)
    .sort((a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position] || b.points - a.points);
  return {
    formation: formationOf(lineup.starters.map((id) => candidates.get(id)!)),
    starters,
    bench: lineup.bench.map((id) => players.get(id)!),
    captainId: lineup.captainId,
    viceCaptainId: lineup.viceCaptainId,
    expectedPoints: round2(evaluation.expectedPoints),
    captainPoints: round2(evaluation.captainPoints),
    autosubPoints: round2(evaluation.autosubPoints),
  };
}

function priceWatch(bootstrap: FplBootstrap, squadIds: Set<number>): PriceWatch {
  if (!hasPriceData(bootstrap.elements)) return { available: false, squad: [], risers: [], fallers: [] };

  const clubs = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));
  const positions = new Map(bootstrap.element_types.map((t) => [t.id, t.singular_name_short]));
  const now = Date.now();
  const hints: PriceHint[] = bootstrap.elements.flatMap((e) => {
    const outlook = priceOutlook(e, now);
    if (!outlook) return [];
    const short = positions.get(e.element_type);
    return [
      {
        id: e.id,
        webName: e.web_name,
        position: (short === 'GKP' ? 'GK' : short) as Position,
        clubShortName: clubs.get(e.team) ?? '?',
        price: e.now_cost / 10,
        ...outlook,
        netTransfers: e.transfers_in_event - e.transfers_out_event,
        changeThisGameweek: e.cost_change_event / 10,
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
      .slice(0, config.nextGameweek.priceWatchPerList);

  return {
    available: true,
    squad: hints.filter((h) => h.inSquad).sort(order),
    risers: league('rise'),
    fallers: league('fall'),
  };
}

async function buildSnapshot(teamId: number, forceRefresh: boolean): Promise<NextGameweekSnapshot> {
  // Projections first: they refresh the team too, so the team call below is answered from the cache.
  const projections = await projectionService.getProjections(teamId, { forceRefresh });
  const [team, bootstrap] = await Promise.all([teamService.getMyTeam(teamId), fplClient.getBootstrap()]);

  const gameweek = projections.gameweeks[0];
  if (gameweek === undefined) throw new HttpError(404, 'There are no gameweeks left to plan this season.');

  const players = new Map(projections.squad.map((p) => [p.id, toLineupPlayer(p)]));
  const candidates = new Map<number, Candidate>(
    [...players.values()].map((p) => [
      p.id,
      { id: p.id, position: p.position, points: p.points, playChance: p.playChance },
    ]),
  );

  const best = bestLineup([...candidates.values()]);

  // The current gameweek's picks: FPL doesn't show next gameweek's until the deadline.
  const picks = team.players.filter((p) => candidates.has(p.id)).sort((a, b) => a.pickPosition - b.pickPosition);
  const currentStarters = picks.filter((p) => p.isStarter).map((p) => p.id);
  const currentBench = picks.filter((p) => !p.isStarter).map((p) => p.id);
  const fallback = bestCaptaincy(currentStarters.map((id) => candidates.get(id)!));
  const current: Lineup = {
    starters: currentStarters,
    bench: currentBench,
    captainId: picks.find((p) => p.isCaptain)?.id ?? fallback.captain.id,
    viceCaptainId: picks.find((p) => p.isViceCaptain)?.id ?? fallback.vice.id,
  };

  const bestChoice = choice(best.lineup, players, candidates);
  const currentChoice = choice(current, players, candidates);

  const starters = best.lineup.starters.map((id) => candidates.get(id)!);
  const captainOptions: CaptainOption[] = starters
    .map((captain) => {
      const vice = bestVice(captain, starters);
      return { player: players.get(captain.id)!, captainPoints: round2(captainPoints(captain, vice)) };
    })
    .sort((a, b) => b.captainPoints - a.captainPoints)
    .slice(0, config.nextGameweek.captainOptions);

  const captainChange =
    current.captainId === best.lineup.captainId
      ? null
      : { from: players.get(current.captainId)!, to: players.get(best.lineup.captainId)! };

  return {
    gameweek,
    deadline: bootstrap.events.find((e) => e.id === gameweek)?.deadline_time ?? null,
    comparedWithGameweek: team.gameweek.id,
    best: bestChoice,
    current: currentChoice,
    gain: round2(bestChoice.expectedPoints - currentChoice.expectedPoints),
    changes: lineupChanges(current.starters, best.lineup.starters, candidates).map((change) => ({
      in: players.get(change.in.id)!,
      out: players.get(change.out.id)!,
      gain: round2(change.in.points - change.out.points),
    })),
    captainChange,
    benchOrderChanged: current.bench.join() !== best.lineup.bench.join(),
    captainOptions,
    formations: best.formations.map((f) => ({ ...f, expectedPoints: round2(f.expectedPoints) })),
    priceWatch: priceWatch(bootstrap, new Set(candidates.keys())),
    differentials: projections.differentials,
  };
}

export const nextGameweekService = {
  /**
   * The best XI, bench order and captain for the next gameweek, compared with the current lineup,
   * plus price-change hints and differentials. Cached in SQLite for config.db.cacheTtlMs.
   */
  getNextGameweek(
    teamId: number = config.fpl.teamId,
    { forceRefresh = false }: { forceRefresh?: boolean } = {},
  ): Promise<NextGameweekResponse> {
    return cachedResponse(`next-gameweek:${teamId}`, config.db.cacheTtlMs, forceRefresh, () =>
      buildSnapshot(teamId, forceRefresh),
    );
  },
};
