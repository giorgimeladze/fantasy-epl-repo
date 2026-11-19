// Auth contract. Re-exported by app/client/src/types.ts: types only.

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  username: string;
  teamId: number; // the account's FPL team: every team endpoint shows this one
  expiresAt: string; // ISO timestamp
}

/** GET /api/auth/session */
export interface SessionResponse {
  username: string;
  teamId: number;
}

export interface Session {
  username: string;
  teamId: number;
  expiresAt: number; // epoch ms
}
