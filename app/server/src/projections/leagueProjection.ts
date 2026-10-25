// Pure: every player's projection for the upcoming gameweeks, from FPL's bootstrap and fixtures plus
// last season's totals and head-to-head averages. projectionService loads the inputs.
import type { FplBootstrap, FplElement, FplFixture } from '../fpl/models.js';
import { positionOf } from '../fpl/fplMappers.js';
import type { HeadToHeadAverages } from '../history/fixtureHistoryRepository.js';
import { decimal, round2, round3, sum } from '../shared/numbers.js';
import type { FixtureInputs, FixtureProjection, PlayerProjection, PointsBreakdown } from './models.js';
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

/** The next `count` gameweeks, starting with the one after the current. */
export function upcomingGameweeks(bootstrap: FplBootstrap, count: number): number[] {
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
    t.goalsFor += decimal(e.expected_goals);
    // Goalkeepers are on the pitch for (nearly) every minute, so theirs is the club's xG against.
    if (positionOf(e, bootstrap) === 'GK') t.goalsAgainst += decimal(e.expected_goals_conceded);
  }

  const shortName = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));
  return new Map([...totals].map(([id, t]) => [shortName.get(id) ?? String(id), t]));
}

function sampleOf(e: FplElement): PlayerSample {
  return {
    minutes: e.minutes,
    starts: e.starts,
    expectedGoals: decimal(e.expected_goals),
    expectedAssists: decimal(e.expected_assists),
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

export interface ProjectionInputs {
  bootstrap: FplBootstrap;
  fixtures: FplFixture[];
  gameweeks: number[];
  priorSeason: Map<number, PlayerSample>;
  headToHead: HeadToHeadAverages;
}

/** Projections for every player in the game, by element id. */
export function projectAll(
  inputs: ProjectionInputs,
  pickPositions: ReadonlyMap<number, number>,
): Map<number, PlayerProjection> {
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
        points: round2(sum(fixtureProjections.map((f) => f.points))),
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
      fplExpectedPoints: e.ep_next === null ? null : decimal(e.ep_next),
      selectedByPercent: decimal(e.selected_by_percent),
      gameweeks: projectedGameweeks,
      nextGameweekPoints: projectedGameweeks[0]?.points ?? 0,
      horizonPoints: round2(sum(projectedGameweeks.map((g) => g.points))),
    });
  }
  return result;
}
