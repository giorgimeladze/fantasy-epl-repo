import { config } from '../config.js';
import { fixtureHistoryRepository } from '../db/fixtureHistoryRepository.js';
import { responseCacheRepository } from '../db/responseCacheRepository.js';
import type { FplBootstrap, FplElement, FplElementHistory, FplTeam } from '../models/fpl.js';
import type {
  FixtureRecord,
  HeadToHeadResponse,
  PlayerHeadToHead,
  PlayerHeadToHeadResponse,
  ScoutOptionsResponse,
} from '../models/headToHead.js';
import type { CacheInfo, Position, UpcomingFixture } from '../models/team.js';
import { HttpError } from '../utils/httpError.js';
import { mapWithConcurrency } from '../utils/mapWithConcurrency.js';
import { fplClient } from './fplClient.js';
import { positionOf, upcomingFixturesByTeam } from './fplMappers.js';
import { summarize, toMatch } from './headToHeadInsights.js';
import { currentSeasonStartYear, historyImporter, previousSeasons, seasonLabel } from './historyImporter.js';
import { teamService } from './teamService.js';

type HeadToHeadSnapshot = Omit<HeadToHeadResponse, 'cache'>;
type PlayerSnapshot = Omit<PlayerHeadToHeadResponse, 'cache'>;

const num = (value: string): number | null => {
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? null : n;
};

function fromElementHistory(
  h: FplElementHistory,
  season: string,
  playerCode: number,
  opponent: FplTeam,
  teamShortName: string | null,
): FixtureRecord {
  return {
    season,
    playerCode,
    fixtureId: h.fixture,
    kickoffTime: h.kickoff_time,
    gameweek: h.round,
    teamShortName,
    opponentCode: opponent.code,
    opponentShortName: opponent.short_name,
    wasHome: h.was_home,
    teamHScore: h.team_h_score,
    teamAScore: h.team_a_score,
    minutes: h.minutes,
    goals: h.goals_scored,
    assists: h.assists,
    cleanSheets: h.clean_sheets,
    goalsConceded: h.goals_conceded,
    ownGoals: h.own_goals,
    penaltiesSaved: h.penalties_saved,
    penaltiesMissed: h.penalties_missed,
    yellowCards: h.yellow_cards,
    redCards: h.red_cards,
    saves: h.saves,
    bonus: h.bonus,
    bps: h.bps,
    totalPoints: h.total_points,
    expectedGoals: num(h.expected_goals),
    expectedAssists: num(h.expected_assists),
    defensiveContribution: h.defensive_contribution ?? null,
  };
}

interface AnalysisContext {
  bootstrap: FplBootstrap;
  currentSeason: string;
  seasonsCovered: string[];
  teamByShortName: Map<string, FplTeam>;
  teamById: Map<number, FplTeam>;
  elementById: Map<number, FplElement>;
}

/** Bootstrap data plus all past seasons in SQLite (downloading any that are missing). */
async function loadContext(bootstrap: FplBootstrap): Promise<AnalysisContext> {
  const startYear = currentSeasonStartYear(bootstrap);
  const currentSeason = seasonLabel(startYear);
  const pastSeasons = await historyImporter.ensureSeasons(previousSeasons(startYear, config.history.pastSeasons));

  return {
    bootstrap,
    currentSeason,
    seasonsCovered: [currentSeason, ...pastSeasons],
    teamByShortName: new Map(bootstrap.teams.map((t) => [t.short_name, t])),
    teamById: new Map(bootstrap.teams.map((t) => [t.id, t])),
    elementById: new Map(bootstrap.elements.map((e) => [e.id, e])),
  };
}

/** One player's last N appearances against their next opponent, with insights and a summary. */
async function analysePlayer(
  ctx: AnalysisContext,
  player: PlayerHeadToHead['player'],
  nextFixture: UpcomingFixture | null,
): Promise<PlayerHeadToHead> {
  const opponent = nextFixture ? ctx.teamByShortName.get(nextFixture.opponent) : undefined;
  const element = ctx.elementById.get(player.id);
  const limit = config.history.matchesPerPlayer;

  let records: FixtureRecord[] = [];
  if (opponent && element) {
    const summary = await fplClient.getElementSummary(player.id);
    const clubShortName = ctx.teamById.get(element.team)?.short_name ?? null;
    const thisSeason = summary.history
      .filter((h) => h.opponent_team === opponent.id && h.minutes > 0)
      .map((h) => fromElementHistory(h, ctx.currentSeason, element.code, opponent, clubShortName));
    const earlier = fixtureHistoryRepository().findPlayedAgainst(element.code, opponent.code, limit);

    records = [...thisSeason, ...earlier]
      .sort((a, b) => (b.kickoffTime ?? '').localeCompare(a.kickoffTime ?? ''))
      .slice(0, limit);
  }

  const matches = records.map((r) => toMatch(r, player.position));
  return { player, nextFixture, matches, summary: summarize(matches) };
}

async function buildSquadSnapshot(teamId: number, forceRefresh: boolean): Promise<HeadToHeadSnapshot> {
  const [team, bootstrap] = await Promise.all([
    teamService.getMyTeam(teamId, { forceRefresh }),
    fplClient.getBootstrap(),
  ]);
  const ctx = await loadContext(bootstrap);

  const players = await mapWithConcurrency(team.players, config.fpl.requestConcurrency, (player) =>
    analysePlayer(
      ctx,
      {
        id: player.id,
        webName: player.webName,
        position: player.position,
        clubShortName: player.club.shortName,
        pickPosition: player.pickPosition,
        isStarter: player.isStarter,
      },
      player.nextFixtures[0] ?? null,
    ),
  );

  return { gameweek: team.gameweek.id, seasonsCovered: ctx.seasonsCovered, players };
}

async function buildPlayerSnapshot(playerId: number): Promise<PlayerSnapshot> {
  const [bootstrap, fixtures] = await Promise.all([fplClient.getBootstrap(), fplClient.getUpcomingFixtures()]);
  const element = bootstrap.elements.find((e) => e.id === playerId);
  if (!element) throw new HttpError(404, `Player ${playerId} not found`);

  const ctx = await loadContext(bootstrap);
  const nextFixture = upcomingFixturesByTeam(fixtures, bootstrap).get(element.team)?.[0] ?? null;
  const result = await analysePlayer(
    ctx,
    {
      id: element.id,
      webName: element.web_name,
      position: positionOf(element, bootstrap),
      clubShortName: ctx.teamById.get(element.team)?.short_name ?? '?',
      pickPosition: null,
      isStarter: false,
    },
    nextFixture,
  );

  return { ...result, seasonsCovered: ctx.seasonsCovered };
}

/** Serves `key` from the SQLite response cache for `ttl`, otherwise builds and stores it. */
async function cached<T extends object>(
  key: string,
  ttl: number,
  forceRefresh: boolean,
  build: () => Promise<T>,
): Promise<T & { cache: CacheInfo }> {
  const cache = responseCacheRepository();
  const hit = forceRefresh ? null : cache.get<T>(key);
  if (hit && Date.now() - hit.fetchedAt < ttl) {
    return { ...hit.payload, cache: cacheInfo(true, hit.fetchedAt, ttl) };
  }

  const payload = await build();
  const fetchedAt = Date.now();
  cache.save(key, payload, fetchedAt);
  return { ...payload, cache: cacheInfo(false, fetchedAt, ttl) };
}

export const headToHeadService = {
  /**
   * For every squad player: their last N appearances against their next opponent,
   * across this season (live FPL) and previous seasons (SQLite history).
   * Cached in SQLite for config.db.headToHeadCacheTtlMs.
   */
  getHeadToHead(
    teamId: number = config.fpl.teamId,
    { forceRefresh = false }: { forceRefresh?: boolean } = {},
  ): Promise<HeadToHeadResponse> {
    return cached(`head-to-head:${teamId}`, config.db.headToHeadCacheTtlMs, forceRefresh, () =>
      buildSquadSnapshot(teamId, forceRefresh),
    );
  },

  /** The same analysis for any Premier League player (the scout picker). */
  getPlayerHeadToHead(
    playerId: number,
    { forceRefresh = false }: { forceRefresh?: boolean } = {},
  ): Promise<PlayerHeadToHeadResponse> {
    return cached(`head-to-head:player:${playerId}`, config.db.headToHeadCacheTtlMs, forceRefresh, () =>
      buildPlayerSnapshot(playerId),
    );
  },

  /** Clubs and their players, for choosing who to scout. */
  async getScoutOptions(): Promise<ScoutOptionsResponse> {
    const bootstrap = await fplClient.getBootstrap();
    const order: Record<Position, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };

    const clubs = bootstrap.teams
      .map((team) => ({
        id: team.id,
        name: team.name,
        shortName: team.short_name,
        players: bootstrap.elements
          .filter((e) => e.team === team.id)
          .map((e) => ({
            id: e.id,
            webName: e.web_name,
            fullName: `${e.first_name} ${e.second_name}`,
            position: positionOf(e, bootstrap),
          }))
          .sort((a, b) => order[a.position] - order[b.position] || a.webName.localeCompare(b.webName)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return { clubs };
  },
};

function cacheInfo(fromCache: boolean, fetchedAt: number, ttl: number): CacheInfo {
  return {
    fromCache,
    fetchedAt: new Date(fetchedAt).toISOString(),
    expiresAt: new Date(fetchedAt + ttl).toISOString(),
  };
}
