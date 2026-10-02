import { config } from '../config.js';
import type { FplBootstrap, FplElement, FplFixture } from '../models/fpl.js';
import type { Position, UpcomingFixture } from '../models/team.js';

const POSITIONS: Record<string, Position> = { GKP: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'FWD' };

export function positionOf(element: FplElement, bootstrap: FplBootstrap): Position {
  const type = bootstrap.element_types.find((t) => t.id === element.element_type);
  return POSITIONS[type?.singular_name_short ?? ''] ?? 'MID';
}

/** Next `config.fpl.upcomingFixturesCount` scheduled fixtures per club (by FPL team id). */
export function upcomingFixturesByTeam(
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
