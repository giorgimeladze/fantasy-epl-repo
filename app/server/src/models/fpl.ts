// Raw payloads from the public FPL API. Only the fields this app reads are typed.

export interface FplEvent {
  id: number;
  name: string;
  deadline_time: string;
  finished: boolean;
  is_current: boolean;
  is_next: boolean;
}

export interface FplTeam {
  id: number;
  code: number; // stable across seasons (unlike id)
  name: string;
  short_name: string;
}

export interface FplElementType {
  id: number;
  singular_name_short: string; // "GKP" | "DEF" | "MID" | "FWD"
}

export interface FplElement {
  id: number;
  code: number; // stable across seasons (unlike id)
  web_name: string;
  first_name: string;
  second_name: string;
  team: number;
  element_type: number;
  now_cost: number;
  form: string;
  points_per_game: string;
  total_points: number;
  event_points: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  bonus: number;
  ict_index: string;
  selected_by_percent: string;
  expected_goals: string;
  expected_assists: string;
  status: string; // "a" available, "d" doubtful, "i" injured, "s" suspended, "u" unavailable, "n" not in squad
  news: string;
  chance_of_playing_next_round: number | null;
}

export interface FplBootstrap {
  events: FplEvent[];
  teams: FplTeam[];
  elements: FplElement[];
  element_types: FplElementType[];
}

export interface FplEntry {
  id: number;
  name: string;
  player_first_name: string;
  player_last_name: string;
  summary_overall_points: number;
  summary_overall_rank: number | null;
  summary_event_points: number;
  current_event: number | null;
  started_event: number;
}

export interface FplPick {
  element: number;
  position: number; // 1–11 starting XI, 12–15 bench
  multiplier: number;
  is_captain: boolean;
  is_vice_captain: boolean;
}

export interface FplAutomaticSub {
  element_in: number;
  element_out: number;
  event: number;
}

export interface FplEntryHistory {
  event: number;
  points: number;
  total_points: number;
  rank: number | null;
  bank: number;
  value: number;
  event_transfers: number;
  event_transfers_cost: number;
  points_on_bench: number;
}

export interface FplPicks {
  active_chip: string | null;
  automatic_subs: FplAutomaticSub[];
  entry_history: FplEntryHistory;
  picks: FplPick[];
}

export interface FplLiveElement {
  id: number;
  stats: {
    total_points: number;
    minutes: number;
  };
}

export interface FplLive {
  elements: FplLiveElement[];
}

export interface FplFixture {
  id: number;
  event: number | null;
  team_h: number;
  team_a: number;
  team_h_difficulty: number;
  team_a_difficulty: number;
  kickoff_time: string | null;
  finished: boolean;
}

/** One fixture in /element-summary/{id}/ `history` (current season only). */
export interface FplElementHistory {
  element: number;
  fixture: number;
  opponent_team: number;
  total_points: number;
  was_home: boolean;
  kickoff_time: string | null;
  team_h_score: number | null;
  team_a_score: number | null;
  round: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  own_goals: number;
  penalties_saved: number;
  penalties_missed: number;
  yellow_cards: number;
  red_cards: number;
  saves: number;
  bonus: number;
  bps: number;
  expected_goals: string;
  expected_assists: string;
  defensive_contribution?: number;
}

export interface FplElementSummary {
  history: FplElementHistory[];
}
