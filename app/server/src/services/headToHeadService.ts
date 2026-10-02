import { config } from '../config.js';
import { fixtureHistoryRepository } from '../db/fixtureHistoryRepository.js';
import { responseCacheRepository } from '../db/responseCacheRepository.js';
import type { FplElementHistory, FplTeam } from '../models/fpl.js';
import type { FixtureRecord, HeadToHeadResponse, PlayerHeadToHead } from '../models/headToHead.js';
import { mapWithConcurrency } from '../utils/mapWithConcurrency.js';
import { fplClient } from './fplClient.js';
import { summarize, toMatch } from './headToHeadInsights.js';
import { currentSeasonStartYear, historyImporter, previousSeasons, seasonLabel } from './historyImporter.js';
import { teamService } from './teamService.js';

type HeadToHeadSnapshot = Omit<HeadToHeadResponse, 'cache'>;

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

async function buildSnapshot(teamId: number, forceRefresh: boolean): Promise<HeadToHeadSnapshot> {
  const [team, bootstrap] = await Promise.all([
    teamService.getMyTeam(teamId, { forceRefresh }),
    fplClient.getBootstrap(),
  ]);

  const startYear = currentSeasonStartYear(bootstrap);
  const currentSeason = seasonLabel(startYear);
  const pastSeasons = await historyImporter.ensureSeasons(previousSeasons(startYear, config.history.pastSeasons));

  const teamByShortName = new Map(bootstrap.teams.map((t) => [t.short_name, t]));
  const teamById = new Map(bootstrap.teams.map((t) => [t.id, t]));
  const elementById = new Map(bootstrap.elements.map((e) => [e.id, e]));
  const limit = config.history.matchesPerPlayer;
  const history = fixtureHistoryRepository();

  const players = await mapWithConcurrency(
    team.players,
    config.fpl.requestConcurrency,
    async (player): Promise<PlayerHeadToHead> => {
      const nextFixture = player.nextFixtures[0] ?? null;
      const opponent = nextFixture ? teamByShortName.get(nextFixture.opponent) : undefined;
      const element = elementById.get(player.id);

      let records: FixtureRecord[] = [];
      if (opponent && element) {
        const summary = await fplClient.getElementSummary(player.id);
        const clubShortName = teamById.get(element.team)?.short_name ?? null;
        const thisSeason = summary.history
          .filter((h) => h.opponent_team === opponent.id && h.minutes > 0)
          .map((h) => fromElementHistory(h, currentSeason, element.code, opponent, clubShortName));
        const earlier = history.findPlayedAgainst(element.code, opponent.code, limit);

        records = [...thisSeason, ...earlier]
          .sort((a, b) => (b.kickoffTime ?? '').localeCompare(a.kickoffTime ?? ''))
          .slice(0, limit);
      }

      const matches = records.map((r) => toMatch(r, player.position));
      return {
        player: {
          id: player.id,
          webName: player.webName,
          position: player.position,
          clubShortName: player.club.shortName,
          pickPosition: player.pickPosition,
          isStarter: player.isStarter,
        },
        nextFixture,
        matches,
        summary: summarize(matches),
      };
    },
  );

  return { gameweek: team.gameweek.id, seasonsCovered: [currentSeason, ...pastSeasons], players };
}

export const headToHeadService = {
  /**
   * For every squad player: their last N appearances against their next opponent,
   * across this season (live FPL) and previous seasons (SQLite history).
   * Cached in SQLite for config.db.headToHeadCacheTtlMs.
   */
  async getHeadToHead(
    teamId: number = config.fpl.teamId,
    { forceRefresh = false }: { forceRefresh?: boolean } = {},
  ): Promise<HeadToHeadResponse> {
    const ttl = config.db.headToHeadCacheTtlMs;
    const cache = responseCacheRepository();
    const key = `head-to-head:${teamId}`;

    const cached = forceRefresh ? null : cache.get<HeadToHeadSnapshot>(key);
    if (cached && Date.now() - cached.fetchedAt < ttl) {
      return { ...cached.payload, cache: cacheInfo(true, cached.fetchedAt, ttl) };
    }

    const snapshot = await buildSnapshot(teamId, forceRefresh);
    const fetchedAt = Date.now();
    cache.save(key, snapshot, fetchedAt);
    return { ...snapshot, cache: cacheInfo(false, fetchedAt, ttl) };
  },
};

function cacheInfo(fromCache: boolean, fetchedAt: number, ttl: number): HeadToHeadResponse['cache'] {
  return {
    fromCache,
    fetchedAt: new Date(fetchedAt).toISOString(),
    expiresAt: new Date(fetchedAt + ttl).toISOString(),
  };
}
