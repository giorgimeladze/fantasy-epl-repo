import type { LoginResponse, MyTeamResponse } from './types.ts';

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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = tokenStore.get();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body) headers.set('Content-Type', 'application/json');

  const res = await fetch(`/api${path}`, { ...init, headers });

  if (res.status === 401) throw new UnauthorizedError('Session expired, please sign in again');
  if (res.status === 204) return undefined as T;

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

export const api = {
  async login(username: string, password: string): Promise<LoginResponse> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) throw new Error((body as { error?: string } | null)?.error ?? 'Login failed');
    return body as LoginResponse;
  },

  logout(): Promise<void> {
    return request<void>('/auth/logout', { method: 'POST' });
  },

  getTeam(forceRefresh = false): Promise<MyTeamResponse> {
    return request<MyTeamResponse>(forceRefresh ? '/team?refresh=true' : '/team');
  },
};
