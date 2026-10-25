import type {
  DraftPlanResponse,
  HeadToHeadResponse,
  LoginResponse,
  MyTeamResponse,
  PlayerHeadToHeadResponse,
  NextGameweekResponse,
  PlannedTransfer,
  PlannerResponse,
  ProjectionsResponse,
  ScoutOptionsResponse,
  TransfersResponse,
} from './types.ts';

const TOKEN_KEY = 'fpl.token';

export class UnauthorizedError extends Error {}

export const tokenStore = {
  get(): string | null {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      sessionStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Storage unavailable (private mode); the session lasts until reload.
    }
  },
  clear(): void {
    try {
      sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
  },
};

interface RequestOptions extends RequestInit {
  /** Send no bearer token, and treat a 401 as an ordinary error (the login form). */
  anonymous?: boolean;
}

async function request<T>(path: string, { anonymous = false, ...init }: RequestOptions = {}): Promise<T> {
  const token = anonymous ? null : tokenStore.get();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');

  const res = await fetch(`/api${path}`, { ...init, headers });

  if (res.status === 401 && !anonymous) throw new UnauthorizedError('Session expired, please sign in again');
  if (res.status === 204) return undefined as T;

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

/** A GET; `forceRefresh` adds `?refresh=true`, which skips the server's response cache. */
const get = <T>(path: string, forceRefresh = false): Promise<T> =>
  request<T>(forceRefresh ? `${path}?refresh=true` : path);

const send = <T>(method: 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> =>
  request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  login: (username: string, password: string) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      anonymous: true,
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  getTeam: (forceRefresh = false) => get<MyTeamResponse>('/team', forceRefresh),
  getHeadToHead: (forceRefresh = false) => get<HeadToHeadResponse>('/head-to-head', forceRefresh),
  getScoutOptions: () => get<ScoutOptionsResponse>('/head-to-head/options'),
  getPlayerHeadToHead: (playerId: number) => get<PlayerHeadToHeadResponse>(`/head-to-head/players/${playerId}`),
  getProjections: (forceRefresh = false) => get<ProjectionsResponse>('/projections', forceRefresh),
  getNextGameweek: (forceRefresh = false) => get<NextGameweekResponse>('/next-gameweek', forceRefresh),
  getTransfers: (forceRefresh = false) => get<TransfersResponse>('/transfers', forceRefresh),
  getPlanner: (forceRefresh = false) => get<PlannerResponse>('/planner', forceRefresh),

  getDraft: () => get<DraftPlanResponse>('/planner/draft'),
  saveDraft: (transfers: PlannedTransfer[]) => send<DraftPlanResponse>('PUT', '/planner/draft', { transfers }),
  clearDraft: () => send<DraftPlanResponse>('DELETE', '/planner/draft'),
};
