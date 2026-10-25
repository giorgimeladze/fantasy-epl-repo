import { config } from '../config/index.js';
import { fixtureHistoryRepository, type HeadToHeadAverages } from '../history/fixtureHistoryRepository.js';
import type { FplBootstrap, FplElement, FplFixture } from '../fpl/models.js';
import type {
  FixtureInputs,
  FixtureProjection,
  PlayerProjection,
  PointsBreakdown,
  ProjectionsResponse,
} from './models.js';
import type { Position } from '../team/models.js';
import { cachedResponse } from '../db/responseCache.js';
import { fplClient } from '../fpl/fplClient.js';
import { positionOf } from '../fpl/fplMappers.js';
import { currentSeasonStartYear, historyImporter, previousSeasons, seasonLabel } from '../history/historyImporter.js';
import {
  availabilityFor,
  type ClubTotals,
  clubStrengths,
  headToHeadFactor,
  type League,
  type ModelPlayer,
  type PlayerSample,
  projectFixture,
  strengthOf,
} from './projectionModel.js';
import { teamService } from '../team/teamService.js';

type ProjectionsSnapshot = Omit<ProjectionsResponse, 'cache'>;

const num = (value: string | null): number => Number.parseFloat(value ?? '') || 0;
// `+ 0` turns −0 into 0, so a JSON round trip (the cache) gives the same value.
const round2 = (value: number): number => Math.round(value * 100) / 100 + 0;
const round3 = (value: number): number => Math.round(value * 1000) / 1000 + 0;
const POSITIONS: Position[] = ['GK', 'DEF', 'MID', 'FWD'];

/** The next `count` gameweeks, starting with the one after the current. */
function upcomingGameweeks(bootstrap: FplBootstrap, count: number): number[] {
  const next = bootstrap.events.find((e) => e.is_next);
  if (!next) return [];
  return bootstrap.events
    .filter((e) => e.id >= next.id)
    .map((e) => e.id)
    .sort((a, b) => a - b)
    .slice(0, count);
}

/** This season's xG for and against per club (by short name), from bootstrap players and finished fixtures. */
function clubTotalsThisSeason(bootstrap: FplBootstrap, fixtures: FplFixture[]): Map<string, ClubTotals> {
  const totals = new Map<number, ClubTotals>(
    bootstrap.teams.map((t) => [t.id, { matches: 0, goalsFor: 0, goalsAgainst: 0 }]),
  );
  for (const f of fixtures) {
    if (!f.finished) continue;
    for (const club of [f.team_h, f.team_a]) {
      const t = totals.get(club);
      if (t) t.matches += 1;
    }
  }
  for (const e of bootstrap.elements) {
    const t = totals.get(e.team);
    if (!t) continue;
    t.goalsFor += num(e.expected_goals);
    // Goalkeepers are on the pitch for (nearly) every minute, so theirs is the club's xG against.
    if (positionOf(e, bootstrap) === 'GK') t.goalsAgainst += num(e.expected_goals_conceded);
  }

  const shortName = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));
  return new Map([...totals].map(([id, t]) => [shortName.get(id) ?? String(id), t]));
}

function sampleOf(e: FplElement): PlayerSample {
  return {
    minutes: e.minutes,
    starts: e.starts,
    expectedGoals: num(e.expected_goals),
    expectedAssists: num(e.expected_assists),
    bonus: e.bonus,
    saves: e.saves,
    yellowCards: e.yellow_cards,
    redCards: e.red_cards,
    defensiveContribution: e.defensive_contribution,
  };
}

function roundBreakdown(b: PointsBreakdown): PointsBreakdown {
  return Object.fromEntries(Object.entries(b).map(([k, v]) => [k, round2(v)])) as unknown as PointsBreakdown;
}

function roundInputs(inputs: FixtureInputs): FixtureInputs {
  return Object.fromEntries(
    Object.entries(inputs).map(([k, v]) => [k, typeof v === 'number' ? round3(v) : v]),
  ) as unknown as FixtureInputs;
}

interface ProjectionInputs {
  bootstrap: FplBootstrap;
  fixtures: FplFixture[];
  gameweeks: number[];
  priorSeason: Map<number, PlayerSample>;
  headToHead: HeadToHeadAverages;
}

/** Projections for every player in the game, by element id. */
function projectAll(inputs: ProjectionInputs, pickPositions: Map<number, number>): Map<number, PlayerProjection> {
  const { bootstrap, fixtures, gameweeks, priorSeason, headToHead } = inputs;
  const clubTotals = clubTotalsThisSeason(bootstrap, fixtures);
  const league: League = clubStrengths(clubTotals);
  const teamById = new Map(bootstrap.teams.map((t) => [t.id, t]));

  // Scheduled fixtures in the horizon, per club and gameweek.
  const byClubAndGw = new Map<string, FplFixture[]>();
  for (const f of fixtures) {
    if (f.event === null || f.finished || !gameweeks.includes(f.event)) continue;
    for (const club of [f.team_h, f.team_a]) {
      const key = `${club}:${f.event}`;
      byClubAndGw.set(key, [...(byClubAndGw.get(key) ?? []), f]);
    }
  }

  const result = new Map<number, PlayerProjection>();
  for (const e of bootstrap.elements) {
    const club = teamById.get(e.team);
    if (!club) continue;
    const position = positionOf(e, bootstrap);
    const player: ModelPlayer = {
      position,
      current: sampleOf(e),
      prior: priorSeason.get(e.code) ?? null,
      clubMatches: clubTotals.get(club.short_name)?.matches ?? 0,
    };

    const projectedGameweeks = gameweeks.map((gameweek, offset) => {
      const availability = availabilityFor(e.status, e.chance_of_playing_next_round, offset);
      const fixtureProjections = (byClubAndGw.get(`${e.team}:${gameweek}`) ?? []).map((f): FixtureProjection => {
        const isHome = f.team_h === e.team;
        const opponent = teamById.get(isHome ? f.team_a : f.team_h);
        const opponentName = opponent?.short_name ?? '?';
        const h2h = headToHeadFactor(
          opponent ? headToHead.byOpponent.get(`${e.code}:${opponent.code}`) : undefined,
          headToHead.overall.get(e.code),
        );
        const estimate = projectFixture(
          player,
          {
            isHome,
            club: strengthOf(league, club.short_name),
            opponent: strengthOf(league, opponentName),
            headToHeadFactor: h2h,
          },
          league,
          availability,
        );
        return {
          opponent: opponentName,
          isHome,
          difficulty: isHome ? f.team_h_difficulty : f.team_a_difficulty,
          points: round2(estimate.points),
          breakdown: roundBreakdown(estimate.breakdown),
          expectedMinutes: Math.round(estimate.expectedMinutes),
          startChance: round2(estimate.startChance),
          playChance: round2(estimate.playChance),
          cleanSheetChance: round2(estimate.cleanSheetChance),
          expectedGoals: round2(estimate.expectedGoals),
          expectedAssists: round2(estimate.expectedAssists),
          headToHeadFactor: round2(h2h),
          inputs: roundInputs(estimate.inputs),
        };
      });
      return {
        gameweek,
        points: round2(fixtureProjections.reduce((sum, f) => sum + f.points, 0)),
        // Fixtures treated as independent; a blank gameweek multiplies nothing and gives 0.
        playChance: fixtureProjections.length
          ? round2(1 - fixtureProjections.reduce((none, f) => none * (1 - f.playChance), 1))
          : 0,
        fixtures: fixtureProjections,
      };
    });

    result.set(e.id, {
      id: e.id,
      webName: e.web_name,
      position,
      clubShortName: club.short_name,
      price: e.now_cost / 10,
      status: e.status,
      news: e.news,
      chanceOfPlaying: e.chance_of_playing_next_round,
      pickPosition: pickPositions.get(e.id) ?? null,
      fplExpectedPoints: e.ep_next === null ? null : num(e.ep_next),
      selectedByPercent: num(e.selected_by_percent),
      gameweeks: projectedGameweeks,
      nextGameweekPoints: projectedGameweeks[0]?.points ?? 0,
      horizonPoints: round2(projectedGameweeks.reduce((sum, g) => sum + g.points, 0)),
    });
  }
  return result;
}

/** Every player's projection for the upcoming gameweeks, with the manager's team they were built for. */
async function projectLeague(teamId: number, forceRefresh: boolean) {
  const [team, bootstrap, fixtures] = await Promise.all([
    teamService.getMyTeam(teamId, { forceRefresh }),
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

async function buildSnapshot(teamId: number, forceRefresh: boolean): Promise<ProjectionsSnapshot> {
  const { team, gameweeks, projections } = await projectLeague(teamId, forceRefresh);

  const squad = team.players.flatMap((p) => projections.get(p.id) ?? []);
  const everyone = [...projections.values()];
  const bestPerPosition = (players: PlayerProjection[], count: number) =>
    Object.fromEntries(
      POSITIONS.map((position) => [
        position,
        players
          .filter((p) => p.position === position)
          .sort((a, b) => b.horizonPoints - a.horizonPoints || b.nextGameweekPoints - a.nextGameweekPoints)
          .slice(0, count),
      ]),
    ) as Record<Position, PlayerProjection[]>;

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
  getProjections(
    teamId: number = config.fpl.teamId,
    { forceRefresh = false }: { forceRefresh?: boolean } = {},
  ): Promise<ProjectionsResponse> {
    return cachedResponse(`projections:${teamId}`, config.db.cacheTtlMs, forceRefresh, () =>
      buildSnapshot(teamId, forceRefresh),
    );
  },

  /**
   * Every player in the game (by element id), not cached: for features that search the whole league,
   * such as transfers. FPL responses still come from fplClient's memory cache.
   */
  async getLeagueProjections(
    teamId: number = config.fpl.teamId,
    { forceRefresh = false }: { forceRefresh?: boolean } = {},
  ): Promise<{ gameweeks: number[]; players: Map<number, PlayerProjection> }> {
    const { gameweeks, projections } = await projectLeague(teamId, forceRefresh);
    return { gameweeks, players: projections };
  },
};
