import { config } from '../config/index.js';
import { cachedEndpoint, type FetchOptions } from '../db/responseCache.js';
import { fplClient } from '../fpl/fplClient.js';
import { fixtureHistoryRepository } from '../history/fixtureHistoryRepository.js';
import { currentSeasonStartYear, historyImporter, previousSeasons, seasonLabel } from '../history/historyImporter.js';
import { groupByPosition } from '../shared/positions.js';
import type { Position } from '../team/models.js';
import { teamService } from '../team/teamService.js';
import { projectAll, upcomingGameweeks } from './leagueProjection.js';
import type { PlayerProjection, ProjectionsResponse } from './models.js';

type ProjectionsSnapshot = Omit<ProjectionsResponse, 'cache'>;

/** Every player's projection for the upcoming gameweeks, with the manager's team they were built for. */
async function projectLeague(teamId: number, forceRefresh: boolean) {
  const [team, bootstrap, fixtures] = await Promise.all([
    teamService.getMyTeam({ teamId, forceRefresh }),
    fplClient.getBootstrap(),
    fplClient.getFixtures(),
  ]);

  const startYear = currentSeasonStartYear(bootstrap);
  const pastSeasons = await historyImporter.ensureSeasons(previousSeasons(startYear, config.history.pastSeasons));
  const repository = fixtureHistoryRepository();
  // Last season only counts if it is the one right before this (a gap means the dataset is missing it).
  const lastSeason = previousSeasons(startYear, 1)[0]!;
  const priorSeason = pastSeasons.includes(lastSeason) ? repository.playerSeasonTotals(lastSeason) : new Map();

  const gameweeks = upcomingGameweeks(bootstrap, config.projections.gameweeks);
  const pickPositions = new Map(team.players.map((p) => [p.id, p.pickPosition]));
  const projections = projectAll(
    {
      bootstrap,
      fixtures,
      gameweeks,
      priorSeason,
      headToHead: repository.headToHeadAverages(seasonLabel(startYear), config.history.matchesPerPlayer),
    },
    pickPositions,
  );
  return { team, gameweeks, projections };
}

/** The best `count` of each position: most points over the horizon, then next gameweek. */
function bestPerPosition(players: PlayerProjection[], count: number): Record<Position, PlayerProjection[]> {
  const ranked = [...players].sort(
    (a, b) => b.horizonPoints - a.horizonPoints || b.nextGameweekPoints - a.nextGameweekPoints,
  );
  const grouped = groupByPosition(ranked);
  for (const position of Object.keys(grouped) as Position[]) grouped[position] = grouped[position].slice(0, count);
  return grouped;
}

async function buildSnapshot(teamId: number, forceRefresh: boolean): Promise<ProjectionsSnapshot> {
  const { team, gameweeks, projections } = await projectLeague(teamId, forceRefresh);

  const squad = team.players.flatMap((p) => projections.get(p.id) ?? []);
  const everyone = [...projections.values()];
  const differentials = everyone.filter(
    (p) => p.pickPosition === null && p.selectedByPercent < config.projections.differentialMaxOwnership,
  );

  return {
    gameweeks,
    squad,
    top: bestPerPosition(everyone, config.projections.topPerPosition),
    differentials: bestPerPosition(differentials, config.projections.differentialsPerPosition),
  };
}

export const projectionService = {
  /**
   * Predicted points for the next gameweeks: the manager's squad plus the top players per position.
   * Cached in SQLite for config.db.cacheTtlMs.
   */
  getProjections: cachedEndpoint<ProjectionsSnapshot>('projections', buildSnapshot),

  /**
   * Every player in the game (by element id), not cached: for features that search the whole league,
   * such as transfers. FPL responses still come from fplClient's memory cache.
   */
  async getLeagueProjections({
    teamId = config.fpl.teamId,
    forceRefresh = false,
  }: FetchOptions = {}): Promise<{ gameweeks: number[]; players: Map<number, PlayerProjection> }> {
    const { gameweeks, projections } = await projectLeague(teamId, forceRefresh);
    return { gameweeks, players: projections };
  },
};
