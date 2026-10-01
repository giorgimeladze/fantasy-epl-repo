import { config } from '../config.js';
import type { FplBootstrap, FplElement, FplFixture, FplPick } from '../models/fpl.js';
import { teamCacheRepository } from '../db/teamCacheRepository.js';
import type { MyTeamResponse, PlayerView, Position, TeamSnapshot, UpcomingFixture } from '../models/team.js';
import { HttpError } from '../utils/httpError.js';
import { mapWithConcurrency } from '../utils/mapWithConcurrency.js';
import { fplClient } from './fplClient.js';
import { type GameweekData, pointsContributed } from './pointsCalculator.js';

const POSITIONS: Record<string, Position> = { GKP: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'FWD' };

const tenths = (value: number): number => value / 10;
const num = (value: string): number => Number.parseFloat(value) || 0;

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
}

function upcomingFixturesByTeam(
  fixtures: FplFixture[],
  bootstrap: FplBootstrap,
): Map<number, UpcomingFixture[]> {
  const shortName = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));
  const byTeam = new Map<number, UpcomingFixture[]>();
  const add = (teamId: number, fixture: UpcomingFixture): void => {
    const list = byTeam.get(teamId) ?? [];
    list.push(fixture);
    byTeam.set(teamId, list);
  };

  const scheduled = fixtures
    .filter((f): f is FplFixture & { event: number } => f.event !== null && !f.finished)
    .sort((a, b) => a.event - b.event || (a.kickoff_time ?? '').localeCompare(b.kickoff_time ?? ''));

  for (const f of scheduled) {
    add(f.team_h, {
      gameweek: f.event,
      opponent: shortName.get(f.team_a) ?? '?',
      isHome: true,
      difficulty: f.team_h_difficulty,
      kickoffTime: f.kickoff_time,
    });
    add(f.team_a, {
      gameweek: f.event,
      opponent: shortName.get(f.team_h) ?? '?',
      isHome: false,
      difficulty: f.team_a_difficulty,
      kickoffTime: f.kickoff_time,
    });
  }

  for (const [teamId, list] of byTeam) {
    byTeam.set(teamId, list.slice(0, config.fpl.upcomingFixturesCount));
  }
  return byTeam;
}

function toPlayerView(
  pick: FplPick,
  element: FplElement,
  bootstrap: FplBootstrap,
  extras: { gameweekPoints: number; pointsForMe: number; nextFixtures: UpcomingFixture[] },
): PlayerView {
  const club = bootstrap.teams.find((t) => t.id === element.team);
  const type = bootstrap.element_types.find((t) => t.id === element.element_type);

  return {
    id: element.id,
    webName: element.web_name,
    fullName: `${element.first_name} ${element.second_name}`,
    position: POSITIONS[type?.singular_name_short ?? ''] ?? 'MID',
    club: { id: element.team, name: club?.name ?? 'Unknown', shortName: club?.short_name ?? '?' },

    pickPosition: pick.position,
    isStarter: pick.position <= 11,
    isCaptain: pick.is_captain,
    isViceCaptain: pick.is_vice_captain,
    multiplier: pick.multiplier,

    price: tenths(element.now_cost),
    form: num(element.form),
    pointsPerGame: num(element.points_per_game),
    totalPoints: element.total_points,
    minutes: element.minutes,
    goals: element.goals_scored,
    assists: element.assists,
    cleanSheets: element.clean_sheets,
    bonus: element.bonus,
    ictIndex: num(element.ict_index),
    expectedGoals: num(element.expected_goals),
    expectedAssists: num(element.expected_assists),
    selectedByPercent: num(element.selected_by_percent),

    gameweekPoints: extras.gameweekPoints,
    pointsForMe: extras.pointsForMe,

    status: element.status,
    news: element.news,
    chanceOfPlayingNextRound: element.chance_of_playing_next_round,

    nextFixtures: extras.nextFixtures,
  };
}

async function fetchSnapshot(teamId: number): Promise<TeamSnapshot> {
  const [bootstrap, entry, fixtures] = await Promise.all([
    fplClient.getBootstrap(),
    fplClient.getEntry(teamId),
    fplClient.getUpcomingFixtures(),
  ]);

  const currentGw = entry.current_event;
  if (!currentGw) throw new HttpError(404, 'This FPL team has no picks yet this season.');

  const finishedById = new Map(bootstrap.events.map((e) => [e.id, e.finished]));
  const history: GameweekData[] = await mapWithConcurrency(
    range(entry.started_event, currentGw),
    config.fpl.requestConcurrency,
    async (gameweek) => {
      const finished = finishedById.get(gameweek) ?? false;
      const [picks, live] = await Promise.all([
        fplClient.getPicks(teamId, gameweek, finished),
        fplClient.getLive(gameweek, finished),
      ]);
      return { gameweek, finished, picks, live };
    },
  );

  const current = history.at(-1);
  if (!current) throw new HttpError(404, 'No gameweek data available for this team.');

  const contributed = pointsContributed(history);
  const liveCurrent = new Map(current.live.elements.map((e) => [e.id, e.stats.total_points]));
  const elements = new Map(bootstrap.elements.map((e) => [e.id, e]));
  const fixturesByTeam = upcomingFixturesByTeam(fixtures, bootstrap);

  const players = current.picks.picks
    .slice()
    .sort((a, b) => a.position - b.position)
    .flatMap((pick) => {
      const element = elements.get(pick.element);
      if (!element) return [];
      return [
        toPlayerView(pick, element, bootstrap, {
          gameweekPoints: liveCurrent.get(element.id) ?? 0,
          pointsForMe: contributed.get(element.id) ?? 0,
          nextFixtures: fixturesByTeam.get(element.team) ?? [],
        }),
      ];
    });

  const event = bootstrap.events.find((e) => e.id === currentGw);
  const eh = current.picks.entry_history;

  return {
    manager: {
      teamId: entry.id,
      teamName: entry.name,
      managerName: `${entry.player_first_name} ${entry.player_last_name}`,
      overallPoints: entry.summary_overall_points,
      overallRank: entry.summary_overall_rank,
      gameweekPoints: eh.points,
      bank: tenths(eh.bank),
      teamValue: tenths(eh.value),
      activeChip: current.picks.active_chip,
      transfersCost: eh.event_transfers_cost,
      pointsOnBench: eh.points_on_bench,
    },
    gameweek: {
      id: currentGw,
      name: event?.name ?? `Gameweek ${currentGw}`,
      deadline: event?.deadline_time ?? '',
      finished: event?.finished ?? false,
    },
    players,
  };
}

export interface GetMyTeamOptions {
  /** Skip the SQLite cache and fetch fresh data from FPL. */
  forceRefresh?: boolean;
}

export const teamService = {
  async getMyTeam(
    teamId: number = config.fpl.teamId,
    { forceRefresh = false }: GetMyTeamOptions = {},
  ): Promise<MyTeamResponse> {
    if (!teamId) {
      throw new HttpError(500, 'FPL_TEAM_ID is not configured. Set it in .env.');
    }

    const ttl = config.db.teamCacheTtlMs;
    const cache = teamCacheRepository();

    const cached = forceRefresh ? null : cache.get(teamId);
    if (cached && Date.now() - cached.fetchedAt < ttl) {
      return { ...cached.snapshot, cache: cacheInfo(true, cached.fetchedAt, ttl) };
    }

    const snapshot = await fetchSnapshot(teamId);
    const fetchedAt = Date.now();
    cache.save(teamId, snapshot, fetchedAt);
    return { ...snapshot, cache: cacheInfo(false, fetchedAt, ttl) };
  },
};

function cacheInfo(fromCache: boolean, fetchedAt: number, ttl: number): MyTeamResponse['cache'] {
  return {
    fromCache,
    fetchedAt: new Date(fetchedAt).toISOString(),
    expiresAt: new Date(fetchedAt + ttl).toISOString(),
  };
}
