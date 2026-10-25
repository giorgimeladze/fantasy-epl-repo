// The outside world for tests, built with MSW (mswjs.io): every request the server makes to the
// FPL API or to the past-season dataset is answered here, so tests never touch the network.
//
// The mock season: team 123456 has played GW1 (finished: Salah captain, Gvardiol auto-subbed
// for Colwill) and GW2 (live: Isak swapped for Jackson, Haaland captain), so 1 free transfer and
// £0.5m in the bank for GW3. Arsenal has 6 of the squad (the 3-per-club rule is broken on purpose:
// the mock league has only 4 clubs). GW3–5 are still to
// play; Arsenal have a double and Man City a blank in GW5. Past seasons cover 2023-24 to 2025-26
// (2022-23 is deliberately missing): Salah has 5 games against Arsenal (one at 0 minutes), Raya
// changes club, and Haaland never meets his next opponent.
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { config } from '../src/config/index.js';
import { fplClient } from '../src/fpl/fplClient.js';
import type { FplBootstrap, FplElement, FplEntryHistory, FplFixture } from '../src/fpl/models.js';

export const MOCK_TEAM_ID = config.fpl.teamId; // 123456, from src/config/testing.ts

const FPL = config.fpl.baseUrl;
const HISTORY = config.history.baseUrl;

// ── FPL data ─────────────────────────────────────────────────────────────────

const GAMEWEEKS = [
  { id: 1, name: 'Gameweek 1', deadline_time: '2026-08-15T10:00:00Z', finished: true, is_current: false, is_next: false },
  { id: 2, name: 'Gameweek 2', deadline_time: '2026-08-22T10:00:00Z', finished: false, is_current: true, is_next: false },
  { id: 3, name: 'Gameweek 3', deadline_time: '2026-08-29T10:00:00Z', finished: false, is_current: false, is_next: true },
  { id: 4, name: 'Gameweek 4', deadline_time: '2026-09-12T10:00:00Z', finished: false, is_current: false, is_next: false },
  { id: 5, name: 'Gameweek 5', deadline_time: '2026-09-19T10:00:00Z', finished: false, is_current: false, is_next: false },
];

const CLUBS = [
  { id: 1, code: 3, name: 'Arsenal', short_name: 'ARS' },
  { id: 2, code: 14, name: 'Liverpool', short_name: 'LIV' },
  { id: 3, code: 43, name: 'Man City', short_name: 'MCI' },
  { id: 4, code: 8, name: 'Chelsea', short_name: 'CHE' },
];

const POSITIONS = [{ id: 1, singular_name_short: 'GKP' }, { id: 2, singular_name_short: 'DEF' }, { id: 3, singular_name_short: 'MID' }, { id: 4, singular_name_short: 'FWD' }];

/** Every player starts from these values; each entry in PLAYERS only lists what differs. */
const DEFAULT_PLAYER = {
  now_cost: 60,
  cost_change_start: 0,
  form: '4.0',
  points_per_game: '4.0',
  total_points: 8,
  event_points: 2,
  minutes: 180,
  goals_scored: 0,
  assists: 0,
  clean_sheets: 0,
  bonus: 0,
  ict_index: '13.6',
  expected_goals: '0.00',
  expected_assists: '0.00',
  status: 'a',
  news: '',
  chance_of_playing_next_round: null,
  starts: 2,
  saves: 0,
  yellow_cards: 0,
  red_cards: 0,
  defensive_contribution: 18,
  expected_goals_conceded: '0.00',
  cost_change_event: 0,
  transfers_in_event: 1000,
  transfers_out_event: 1000,
  price_change_percent: '0.0',
  price_change_projections: [{ offset: 0, projected_percent: '0.0', likelihood: 0 }, { offset: 1, projected_percent: '0.0', likelihood: 0 }, { offset: 2, projected_percent: '0.0', likelihood: 0 }],
  price_change_locked_until: null,
};

const PLAYERS: FplElement[] = [
  { ...DEFAULT_PLAYER, id: 1, code: 100001, web_name: 'Raya', first_name: 'David', second_name: 'Raya', team: 1, element_type: 1, now_cost: 55, clean_sheets: 1, bonus: 1, selected_by_percent: '3.1', saves: 6, defensive_contribution: 0, expected_goals_conceded: '1.80', ep_next: '4.1' },
  { ...DEFAULT_PLAYER, id: 2, code: 100002, web_name: 'Alisson', first_name: 'Alisson', second_name: 'Becker', team: 2, element_type: 1, now_cost: 55, form: '1.5', points_per_game: '1.5', total_points: 3, event_points: 0, ict_index: '5.1', selected_by_percent: '6.2', saves: 6, defensive_contribution: 0, expected_goals_conceded: '2.40', ep_next: '3.8' },
  { ...DEFAULT_PLAYER, id: 3, code: 100003, web_name: 'Saliba', first_name: 'William', second_name: 'Saliba', team: 1, element_type: 2, form: '3.5', points_per_game: '3.5', total_points: 7, event_points: 1, clean_sheets: 1, ict_index: '11.9', selected_by_percent: '9.3', ep_next: '4.0' },
  { ...DEFAULT_PLAYER, id: 4, code: 100004, web_name: 'Gabriel', first_name: 'Gabriel', second_name: 'dos Santos Magalhães', team: 1, element_type: 2, form: '4.5', points_per_game: '4.5', total_points: 9, event_points: 1, goals_scored: 1, clean_sheets: 1, bonus: 2, ict_index: '15.3', selected_by_percent: '12.4', expected_goals: '0.90', yellow_cards: 1, ep_next: '4.4' },
  { ...DEFAULT_PLAYER, id: 5, code: 100005, web_name: 'Virgil', first_name: 'Virgil', second_name: 'van Dijk', team: 2, element_type: 2, event_points: 6, assists: 1, clean_sheets: 1, selected_by_percent: '15.5', expected_assists: '0.80', ep_next: '3.9' },
  { ...DEFAULT_PLAYER, id: 6, code: 100006, web_name: 'Gvardiol', first_name: 'Joško', second_name: 'Gvardiol', team: 3, element_type: 2, form: '1.0', points_per_game: '2.0', total_points: 2, minutes: 90, ict_index: '3.4', selected_by_percent: '18.6', status: 'd', news: 'Knock - 75% chance of playing', chance_of_playing_next_round: 75, starts: 1, ep_next: '2.6' },
  { ...DEFAULT_PLAYER, id: 7, code: 100007, web_name: 'Colwill', first_name: 'Levi', second_name: 'Colwill', team: 4, element_type: 2, now_cost: 45, form: '1.5', points_per_game: '1.5', total_points: 3, event_points: 1, minutes: 160, ict_index: '5.1', selected_by_percent: '21.7', ep_next: '3.1' },
  { ...DEFAULT_PLAYER, id: 8, code: 100008, web_name: 'Saka', first_name: 'Bukayo', second_name: 'Saka', team: 1, element_type: 3, now_cost: 100, cost_change_start: 3, event_points: 3, minutes: 170, assists: 1, selected_by_percent: '24.8', expected_assists: '0.80', defensive_contribution: 14, ep_next: '5.2', cost_change_event: 1, transfers_in_event: 52000, transfers_out_event: 3000, price_change_percent: '84.0', price_change_projections: [{ offset: 0, projected_percent: '96.0', likelihood: 4 }, { offset: 1, projected_percent: '144.0', likelihood: 5 }, { offset: 2, projected_percent: '192.0', likelihood: 5 }] },
  { ...DEFAULT_PLAYER, id: 9, code: 100009, web_name: 'M.Salah', first_name: 'Mohamed', second_name: 'Salah', team: 2, element_type: 3, now_cost: 145, form: '8.5', points_per_game: '8.5', total_points: 17, event_points: 5, goals_scored: 2, assists: 1, bonus: 3, ict_index: '28.9', selected_by_percent: '27.9', expected_goals: '1.80', expected_assists: '0.80', defensive_contribution: 14, ep_next: '6.8' },
  { ...DEFAULT_PLAYER, id: 10, code: 100010, web_name: 'Foden', first_name: 'Phil', second_name: 'Foden', team: 3, element_type: 3, now_cost: 85, form: '2.5', points_per_game: '2.5', total_points: 5, minutes: 150, ict_index: '8.5', selected_by_percent: '31.0', defensive_contribution: 14, ep_next: '4.6' },
  { ...DEFAULT_PLAYER, id: 11, code: 100011, web_name: 'Palmer', first_name: 'Cole', second_name: 'Palmer', team: 4, element_type: 3, now_cost: 105, cost_change_start: -1, form: '8.5', points_per_game: '8.5', total_points: 17, event_points: 10, goals_scored: 2, assists: 2, bonus: 3, ict_index: '28.9', selected_by_percent: '34.1', expected_goals: '1.80', expected_assists: '1.60', defensive_contribution: 14, ep_next: '5.9' },
  { ...DEFAULT_PLAYER, id: 12, code: 100012, web_name: 'Rice', first_name: 'Declan', second_name: 'Rice', team: 1, element_type: 3, now_cost: 65, form: '3.0', points_per_game: '3.0', total_points: 6, assists: 1, clean_sheets: 1, ict_index: '10.2', selected_by_percent: '37.2', expected_assists: '0.80', yellow_cards: 1, defensive_contribution: 14, ep_next: '4.2', transfers_in_event: 800, transfers_out_event: 9000, price_change_percent: '-12.0', price_change_projections: [{ offset: 0, projected_percent: '-15.0', likelihood: -1 }, { offset: 1, projected_percent: '-22.5', likelihood: -1 }, { offset: 2, projected_percent: '-30.0', likelihood: -2 }] },
  { ...DEFAULT_PLAYER, id: 13, code: 100013, web_name: 'Haaland', first_name: 'Erling', second_name: 'Haaland', team: 3, element_type: 4, now_cost: 150, cost_change_start: 4, form: '11.0', points_per_game: '11.0', total_points: 22, event_points: 13, goals_scored: 3, bonus: 3, ict_index: '37.4', selected_by_percent: '40.3', expected_goals: '2.70', defensive_contribution: 4, ep_next: '7.4', transfers_in_event: 60000, price_change_projections: [{ offset: 0, projected_percent: '0.0', likelihood: 5 }, { offset: 1, projected_percent: '0.0', likelihood: 5 }, { offset: 2, projected_percent: '0.0', likelihood: 5 }], price_change_locked_until: '2099-01-01T00:00:00Z' },
  { ...DEFAULT_PLAYER, id: 14, code: 100014, web_name: 'N.Jackson', first_name: 'Nicolas', second_name: 'Jackson', team: 4, element_type: 4, now_cost: 75, form: '2.0', points_per_game: '2.0', total_points: 4, minutes: 170, ict_index: '6.8', selected_by_percent: '43.4', defensive_contribution: 4, ep_next: '4.3' },
  { ...DEFAULT_PLAYER, id: 15, code: 100015, web_name: 'Havertz', first_name: 'Kai', second_name: 'Havertz', team: 1, element_type: 4, now_cost: 75, form: '3.0', points_per_game: '3.0', total_points: 6, event_points: 0, minutes: 120, goals_scored: 1, ict_index: '10.2', selected_by_percent: '46.5', expected_goals: '0.90', status: 'i', news: 'Hamstring injury - Unknown return date', chance_of_playing_next_round: 0, starts: 1, defensive_contribution: 4, ep_next: '0.0', transfers_in_event: 900, transfers_out_event: 41000, price_change_percent: '-61.0', price_change_projections: [{ offset: 0, projected_percent: '-70.0', likelihood: -2 }, { offset: 1, projected_percent: '-105.0', likelihood: -3 }, { offset: 2, projected_percent: '-140.0', likelihood: -4 }] },
  { ...DEFAULT_PLAYER, id: 16, code: 100016, web_name: 'Isak', first_name: 'Alexander', second_name: 'Isak', team: 2, element_type: 4, now_cost: 90, form: '1.0', points_per_game: '2.0', total_points: 2, event_points: 0, minutes: 60, ict_index: '3.4', selected_by_percent: '4.2', starts: 1, defensive_contribution: 4, ep_next: '3.0', transfers_in_event: 38000, transfers_out_event: 2500, price_change_percent: '71.0', price_change_projections: [{ offset: 0, projected_percent: '88.0', likelihood: 3 }, { offset: 1, projected_percent: '132.0', likelihood: 4 }, { offset: 2, projected_percent: '176.0', likelihood: 5 }] },
];

/** A fresh copy of bootstrap-static, so a test can edit it and serve it with `fplReturns`. */
export function bootstrap(): FplBootstrap {
  return structuredClone({ events: GAMEWEEKS, teams: CLUBS, element_types: POSITIONS, elements: PLAYERS });
}

const idOf = (webName: string) => PLAYERS.find((p) => p.web_name === webName)!.id;

/** A gameweek's picks: 15 names in pick order (12–15 are the bench), captain ×2. */
function picks(
  squad: string[],
  armbands: { captain: string; vice: string },
  entryHistory: FplEntryHistory,
  autoSubs: { in: string; out: string }[] = [],
) {
  return {
    active_chip: null,
    automatic_subs: autoSubs.map((s) => ({ element_in: idOf(s.in), element_out: idOf(s.out), event: entryHistory.event })),
    entry_history: entryHistory,
    picks: squad.map((name, i) => ({
      element: idOf(name),
      position: i + 1,
      multiplier: name === armbands.captain ? 2 : i < 11 ? 1 : 0,
      is_captain: name === armbands.captain,
      is_vice_captain: name === armbands.vice,
    })),
  };
}

const PICKS: Record<number, ReturnType<typeof picks>> = {
  1: picks(
    ['Raya', 'Saliba', 'Gabriel', 'Virgil', 'Gvardiol', 'Saka', 'M.Salah', 'Foden', 'Palmer', 'Haaland', 'Isak', 'Alisson', 'Colwill', 'Rice', 'Havertz'],
    { captain: 'M.Salah', vice: 'Haaland' },
    { event: 1, points: 74, total_points: 74, rank: 400000, bank: 0, value: 1000, event_transfers: 0, event_transfers_cost: 0, points_on_bench: 13 },
    [{ in: 'Colwill', out: 'Gvardiol' }],
  ),
  2: picks(
    ['Raya', 'Saliba', 'Gabriel', 'Virgil', 'Gvardiol', 'Saka', 'M.Salah', 'Foden', 'Palmer', 'Haaland', 'N.Jackson', 'Alisson', 'Colwill', 'Rice', 'Havertz'],
    { captain: 'Haaland', vice: 'M.Salah' },
    { event: 2, points: 60, total_points: 134, rank: 250000, bank: 5, value: 1002, event_transfers: 1, event_transfers_cost: 0, points_on_bench: 3 },
  ),
};

/** /entry/{id}/history/: the gameweeks played (same rows as the picks' entry_history), no chips. */
function entryHistory() {
  return { current: Object.values(PICKS).map((p) => p.entry_history), past: [], chips: [] };
}

/** /entry/{id}/transfers/, newest first: Isak out for N.Jackson before GW2 (Jackson has risen since). */
const TRANSFERS = [
  { element_in: idOf('N.Jackson'), element_in_cost: 72, element_out: idOf('Isak'), element_out_cost: 80, entry: 123456, event: 2, time: '2026-08-20T18:00:00Z' },
];

/** Points and minutes per player in each gameweek. */
const LIVE: Record<number, Record<string, [points: number, minutes: number]>> = {
  1: {
    Raya: [6, 90], Alisson: [3, 90], Saliba: [6, 90], Gabriel: [8, 90], Virgil: [2, 90], Gvardiol: [0, 0], Colwill: [2, 90], Saka: [5, 90], 'M.Salah': [12, 90], Foden: [3, 90], Palmer: [7, 90], Rice: [4, 90], Haaland: [9, 90], 'N.Jackson': [2, 90], Havertz: [6, 90], Isak: [2, 90],
  },
  2: {
    Raya: [2, 90], Alisson: [0, 0], Saliba: [1, 90], Gabriel: [1, 90], Virgil: [6, 90], Gvardiol: [2, 90], Colwill: [1, 90], Saka: [3, 90], 'M.Salah': [5, 90], Foden: [2, 90], Palmer: [10, 90], Rice: [2, 90], Haaland: [13, 90], 'N.Jackson': [2, 90], Havertz: [0, 0], Isak: [0, 0],
  },
};

function live(gameweek: number) {
  const stats = LIVE[gameweek];
  if (!stats) return undefined;
  return {
    elements: Object.entries(stats).map(([name, [points, minutes]]) => ({
      id: idOf(name),
      stats: { total_points: points, minutes },
    })),
  };
}

const FIXTURES: FplFixture[] = [
  { id: 1, event: 1, team_h: 2, team_a: 1, team_h_difficulty: 4, team_a_difficulty: 4, kickoff_time: '2026-08-16T15:30:00Z', finished: true },
  { id: 2, event: 1, team_h: 3, team_a: 4, team_h_difficulty: 3, team_a_difficulty: 4, kickoff_time: '2026-08-16T13:00:00Z', finished: true },
  { id: 11, event: 2, team_h: 1, team_a: 3, team_h_difficulty: 4, team_a_difficulty: 4, kickoff_time: '2026-08-23T15:30:00Z', finished: true },
  { id: 12, event: 2, team_h: 4, team_a: 2, team_h_difficulty: 4, team_a_difficulty: 3, kickoff_time: '2026-08-23T13:00:00Z', finished: true },
  { id: 21, event: 3, team_h: 1, team_a: 2, team_h_difficulty: 4, team_a_difficulty: 4, kickoff_time: '2026-08-29T16:30:00Z', finished: false },
  { id: 22, event: 3, team_h: 3, team_a: 4, team_h_difficulty: 3, team_a_difficulty: 4, kickoff_time: '2026-08-29T14:00:00Z', finished: false },
  { id: 31, event: 4, team_h: 2, team_a: 3, team_h_difficulty: 4, team_a_difficulty: 5, kickoff_time: '2026-09-12T14:00:00Z', finished: false },
  { id: 32, event: 4, team_h: 4, team_a: 1, team_h_difficulty: 4, team_a_difficulty: 3, kickoff_time: '2026-09-12T16:30:00Z', finished: false },
  { id: 41, event: 5, team_h: 1, team_a: 4, team_h_difficulty: 3, team_a_difficulty: 4, kickoff_time: '2026-09-19T14:00:00Z', finished: false },
  { id: 42, event: 5, team_h: 2, team_a: 1, team_h_difficulty: 4, team_a_difficulty: 4, kickoff_time: '2026-09-21T19:00:00Z', finished: false },
  { id: 99, event: null, team_h: 1, team_a: 3, team_h_difficulty: 4, team_a_difficulty: 4, kickoff_time: null, finished: false },
];

const ENTRY = { id: 123456, name: 'Mock Mid Table FC', player_first_name: 'Test', player_last_name: 'Manager', summary_overall_points: 134, summary_overall_rank: 250000, summary_event_points: 60, current_event: 2, started_event: 1 };

/** This season's matches per player id; players not listed have none. */
const MATCHES: Record<number, object[]> = {
  9: [
    { element: 9, fixture: 1, opponent_team: 1, total_points: 12, was_home: true, kickoff_time: '2026-08-16T15:30:00Z', team_h_score: 3, team_a_score: 1, round: 1, minutes: 90, goals_scored: 1, assists: 1, clean_sheets: 0, goals_conceded: 1, own_goals: 0, penalties_saved: 0, penalties_missed: 0, yellow_cards: 0, red_cards: 0, saves: 0, bonus: 2, bps: 41, expected_goals: '0.74', expected_assists: '0.45', defensive_contribution: 4 },
    { element: 9, fixture: 12, opponent_team: 4, total_points: 5, was_home: false, kickoff_time: '2026-08-23T14:00:00Z', team_h_score: 1, team_a_score: 1, round: 2, minutes: 90, goals_scored: 0, assists: 0, clean_sheets: 0, goals_conceded: 1, own_goals: 0, penalties_saved: 0, penalties_missed: 0, yellow_cards: 0, red_cards: 0, saves: 0, bonus: 0, bps: 20, expected_goals: '0.20', expected_assists: '0.00', defensive_contribution: 0 },
  ],
};

// ── Past seasons (CSV files from the vaastav/Fantasy-Premier-League dataset) ──

const HISTORY_FILES: Record<string, string> = {
  '2023-24/gws/merged_gw.csv': `name,position,team,assists,bonus,bps,clean_sheets,element,expected_assists,expected_goals,fixture,goals_conceded,goals_scored,kickoff_time,minutes,opponent_team,own_goals,penalties_missed,penalties_saved,red_cards,round,saves,team_a_score,team_h_score,total_points,was_home,yellow_cards,GW
Mohamed Salah,MID,Liverpool,0,0,10,0,300,0.10,0.20,301,3,0,2024-02-04T16:30:00Z,90,1,0,0,0,0,23,0,1,3,2,False,0,23
David Raya,GK,Brentford,0,0,8,0,500,0.00,0.00,302,3,0,2023-11-12T14:00:00Z,90,11,0,0,0,0,12,2,1,3,0,False,1,12
`,
  '2023-24/players_raw.csv': `code,first_name,id,second_name,team_code,web_name
100009,Mohamed,300,Salah,14,M.Salah
100001,David,500,Raya,94,Raya
`,
  '2023-24/teams.csv': `code,draw,form,id,loss,name,played,points,position,short_name,strength
3,0,,1,0,Arsenal,0,0,2,ARS,5
94,0,,4,0,Brentford,0,0,16,BRE,3
14,0,,11,0,Liverpool,0,0,3,LIV,5
`,
  '2024-25/gws/merged_gw.csv': `name,position,team,assists,bonus,bps,clean_sheets,element,expected_assists,expected_goals,fixture,goals_conceded,goals_scored,kickoff_time,minutes,opponent_team,own_goals,penalties_missed,penalties_saved,red_cards,round,saves,team_a_score,team_h_score,total_points,was_home,yellow_cards,GW
Mohamed Salah,MID,Liverpool,1,0,25,0,308,0.40,0.30,201,2,0,2024-10-27T16:30:00Z,90,1,0,0,0,0,9,0,2,2,4,False,1,9
Mohamed Salah,MID,Liverpool,0,1,33,0,308,0.05,0.65,202,2,1,2025-05-11T15:30:00Z,85,1,0,0,0,0,36,0,2,2,8,True,0,36
David Raya,GK,Arsenal,0,0,22,0,20,0.00,0.00,201,2,0,2024-10-27T16:30:00Z,90,11,0,0,0,0,9,3,2,2,2,True,0,9
`,
  '2024-25/players_raw.csv': `code,first_name,id,second_name,team_code,web_name
100009,Mohamed,308,Salah,14,M.Salah
100001,David,20,Raya,3,Raya
`,
  '2024-25/teams.csv': `code,draw,form,id,loss,name,played,points,position,short_name,strength
3,0,,1,0,Arsenal,0,0,2,ARS,5
94,0,,4,0,Brentford,0,0,10,BRE,3
8,0,,6,0,Chelsea,0,0,4,CHE,4
14,0,,11,0,Liverpool,0,0,1,LIV,5
43,0,,12,0,Man City,0,0,3,MCI,5
`,
  '2025-26/gws/merged_gw.csv': `name,position,team,assists,bonus,bps,clean_sheets,element,expected_assists,expected_goals,fixture,goals_conceded,goals_scored,kickoff_time,minutes,opponent_team,own_goals,penalties_missed,penalties_saved,red_cards,round,saves,team_a_score,team_h_score,total_points,was_home,yellow_cards,defensive_contribution,GW,starts,xP
Mohamed Salah,MID,Liverpool,0,3,48,1,328,0.10,0.80,101,0,1,2025-11-01T17:30:00Z,90,1,0,0,0,0,10,0,0,2,11,True,0,3,10,1,5.5
Mohamed Salah,MID,Liverpool,0,0,0,0,328,0.00,0.00,102,0,0,2026-03-15T16:30:00Z,0,1,0,0,0,0,29,0,2,1,0,False,0,0,29,0,0.0
Mohamed Salah,MID,Liverpool,0,0,14,0,328,0.05,0.30,103,1,0,2025-09-20T14:00:00Z,90,7,0,0,0,0,5,0,1,1,2,True,0,2,5,1,5.5
David Raya,GK,Arsenal,0,0,18,0,1,0.00,0.00,101,2,0,2025-11-01T17:30:00Z,90,12,0,0,0,0,10,4,0,2,2,False,0,0,10,1,5.5
Ghost Player,MID,Arsenal,0,0,0,0,999,0.00,0.00,101,0,0,2025-11-01T17:30:00Z,90,12,0,0,0,0,10,0,0,2,2,False,0,0,10,1,5.5
Some Manager,AM,Arsenal,0,0,0,0,0,777,0.00,0.00,101,0,0,2025-11-01T17:30:00Z,90,12,0,0,0,0,10,0,0,2,6,False,0,0,10,0,0.0
`,
  '2025-26/players_raw.csv': `code,first_name,id,second_name,team_code,web_name
100009,Mohamed,328,Salah,14,M.Salah
100001,David,1,Raya,3,Raya
100013,Erling,430,Haaland,43,Haaland
100777,Some,777,Manager,3,Manager
`,
  '2025-26/teams.csv': `code,draw,form,id,loss,name,played,points,position,short_name,strength
3,0,,1,0,Arsenal,0,0,1,ARS,5
8,0,,7,0,Chelsea,0,0,4,CHE,4
14,0,,12,0,Liverpool,0,0,2,LIV,5
43,0,,13,0,Man City,0,0,3,MCI,5
94,0,,5,0,Brentford,0,0,10,BRE,3
`,
};

// ── Handlers ─────────────────────────────────────────────────────────────────

const notFound = () => HttpResponse.json({ detail: 'Not found.' }, { status: 404 });

export const mockServer = setupServer(
  http.get(`${FPL}/bootstrap-static/`, () => HttpResponse.json(bootstrap())),
  http.get(`${FPL}/entry/${MOCK_TEAM_ID}/`, () => HttpResponse.json(ENTRY)),
  http.get(`${FPL}/entry/${MOCK_TEAM_ID}/history/`, () => HttpResponse.json(entryHistory())),
  http.get(`${FPL}/entry/${MOCK_TEAM_ID}/transfers/`, () => HttpResponse.json(TRANSFERS)),
  http.get(`${FPL}/entry/${MOCK_TEAM_ID}/event/:gameweek/picks/`, ({ params }) => {
    const gameweekPicks = PICKS[Number(params.gameweek)];
    return gameweekPicks ? HttpResponse.json(gameweekPicks) : notFound();
  }),
  http.get(`${FPL}/event/:gameweek/live/`, ({ params }) => {
    const gameweekLive = live(Number(params.gameweek));
    return gameweekLive ? HttpResponse.json(gameweekLive) : notFound();
  }),
  // `/fixtures/` is every fixture; `/fixtures/?future=1` only the unplayed ones.
  http.get(`${FPL}/fixtures/`, ({ request }) => {
    const future = new URL(request.url).searchParams.has('future');
    return HttpResponse.json(future ? FIXTURES.filter((f) => !f.finished) : FIXTURES);
  }),
  http.get(`${FPL}/element-summary/:id/`, ({ params }) =>
    HttpResponse.json({ history: MATCHES[Number(params.id)] ?? [], fixtures: [], history_past: [] }),
  ),
  // Anything else (e.g. another manager's team) is a 404, like the real API.
  http.get(`${FPL}/*`, notFound),

  http.get(`${HISTORY}/*`, ({ request }) => {
    const file = HISTORY_FILES[request.url.slice(HISTORY.length + 1)];
    return file === undefined ? new HttpResponse('404: Not Found', { status: 404 }) : HttpResponse.text(file);
  }),
);

// ── What tests use ───────────────────────────────────────────────────────────

/** FPL API paths requested in the current test, in order (e.g. "/entry/123456/"). */
export const fplCalls: string[] = [];
/** Past-season files requested in the current test, in order (e.g. "2025-26/teams.csv"). */
export const historyCalls: string[] = [];

mockServer.events.on('request:start', ({ request }) => {
  if (request.url.startsWith(FPL)) fplCalls.push(request.url.slice(FPL.length));
  if (request.url.startsWith(HISTORY)) historyCalls.push(request.url.slice(HISTORY.length + 1));
});

export function resetCalls(): void {
  fplCalls.length = 0;
  historyCalls.length = 0;
}

/** For the rest of the current test, the FPL endpoint at `path` returns `body`. */
export function fplReturns(path: string, body: object): void {
  fplClient.clearCache(); // so the next request sees the new response
  mockServer.use(http.get(`${FPL}${path}`, () => HttpResponse.json(body)));
}

/** For the rest of the current test, the FPL endpoint at `path` fails with `status` (e.g. 503 while FPL updates). */
export function fplFails(path: string, status: number): void {
  fplClient.clearCache();
  mockServer.use(http.get(`${FPL}${path}`, () => HttpResponse.json({}, { status })));
}
