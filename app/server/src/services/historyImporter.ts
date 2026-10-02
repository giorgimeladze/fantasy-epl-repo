import { config } from '../config.js';
import { fixtureHistoryRepository } from '../db/fixtureHistoryRepository.js';
import type { FplBootstrap } from '../models/fpl.js';
import type { FixtureRecord } from '../models/headToHead.js';
import { parseCsv } from '../utils/csv.js';
import { HttpError } from '../utils/httpError.js';

/** "2025-26" for 2025. */
export function seasonLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** The calendar year the current FPL season started in, from the first gameweek's deadline. */
export function currentSeasonStartYear(bootstrap: FplBootstrap): number {
  const first = bootstrap.events[0]?.deadline_time;
  const date = first ? new Date(first) : new Date();
  // Seasons start in August; anything before July belongs to the season that started last year.
  return date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
}

/** The `count` seasons before the current one, newest first. */
export function previousSeasons(currentStartYear: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => seasonLabel(currentStartYear - 1 - i));
}

async function fetchText(url: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw new HttpError(502, `Could not download historical data (${(err as Error).message})`);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new HttpError(502, `Historical data source responded ${res.status} for ${url}`);
  return res.text();
}

const int = (value: string | undefined): number => Number.parseInt(value ?? '', 10) || 0;
const nullableInt = (value: string | undefined): number | null =>
  value === undefined || value === '' ? null : Number.parseInt(value, 10);
const nullableFloat = (value: string | undefined): number | null =>
  value === undefined || value === '' ? null : Number.parseFloat(value);

/** Turns one season's CSV files (merged_gw, players_raw, teams) into fixture records. */
export function buildSeasonRecords(
  season: string,
  mergedGwCsv: string,
  playersRawCsv: string,
  teamsCsv: string,
): FixtureRecord[] {
  const teams = parseCsv(teamsCsv);
  const teamById = new Map(teams.map((t) => [int(t.id), { code: int(t.code), shortName: t.short_name ?? '' }]));
  const shortNameByName = new Map(teams.map((t) => [t.name, t.short_name ?? null]));
  const playerCodeById = new Map(parseCsv(playersRawCsv).map((p) => [int(p.id), int(p.code)]));

  const records: FixtureRecord[] = [];
  for (const row of parseCsv(mergedGwCsv)) {
    const playerCode = playerCodeById.get(int(row.element));
    const opponent = teamById.get(int(row.opponent_team));
    if (!playerCode || !opponent) continue;

    records.push({
      season,
      playerCode,
      fixtureId: int(row.fixture),
      kickoffTime: row.kickoff_time || null,
      gameweek: nullableInt(row.GW ?? row.round),
      teamShortName: shortNameByName.get(row.team ?? '') ?? null,
      opponentCode: opponent.code,
      opponentShortName: opponent.shortName,
      wasHome: row.was_home === 'True',
      teamHScore: nullableInt(row.team_h_score),
      teamAScore: nullableInt(row.team_a_score),
      minutes: int(row.minutes),
      goals: int(row.goals_scored),
      assists: int(row.assists),
      cleanSheets: int(row.clean_sheets),
      goalsConceded: int(row.goals_conceded),
      ownGoals: int(row.own_goals),
      penaltiesSaved: int(row.penalties_saved),
      penaltiesMissed: int(row.penalties_missed),
      yellowCards: int(row.yellow_cards),
      redCards: int(row.red_cards),
      saves: int(row.saves),
      bonus: int(row.bonus),
      bps: int(row.bps),
      totalPoints: int(row.total_points),
      expectedGoals: nullableFloat(row.expected_goals),
      expectedAssists: nullableFloat(row.expected_assists),
      defensiveContribution: nullableInt(row.defensive_contribution),
    });
  }
  return records;
}

/** Downloads and stores one season. Returns false if the data source doesn't have it. */
async function importSeason(season: string): Promise<boolean> {
  const base = `${config.history.baseUrl}/${season}`;
  const [mergedGw, playersRaw, teams] = await Promise.all([
    fetchText(`${base}/gws/merged_gw.csv`),
    fetchText(`${base}/players_raw.csv`),
    fetchText(`${base}/teams.csv`),
  ]);
  if (mergedGw === null || playersRaw === null || teams === null) {
    console.warn(`Historical data for ${season} is not available; skipping.`);
    return false;
  }

  const records = buildSeasonRecords(season, mergedGw, playersRaw, teams);
  fixtureHistoryRepository().saveSeason(season, records);
  console.log(`Imported ${records.length} fixture rows for ${season}.`);
  return true;
}

const inFlight = new Map<string, Promise<boolean>>();

export const historyImporter = {
  /**
   * Makes sure the given past seasons are in SQLite, downloading any that are missing
   * (once — past seasons never change). Returns the seasons that are available.
   */
  async ensureSeasons(seasons: readonly string[]): Promise<string[]> {
    const imported = new Set(fixtureHistoryRepository().importedSeasons());
    const available: string[] = [];

    // Sequential: each season is ~5 MB of CSV, no need to hold several in memory at once.
    for (const season of seasons) {
      if (!imported.has(season)) {
        let pending = inFlight.get(season);
        if (!pending) {
          pending = importSeason(season).finally(() => inFlight.delete(season));
          inFlight.set(season, pending);
        }
        if (!(await pending)) continue;
      }
      available.push(season);
    }
    return available;
  },
};
