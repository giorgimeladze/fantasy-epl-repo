// Auth contract. Re-exported by app/client/src/types.ts: types only.

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  username: string;
  expiresAt: string; // ISO timestamp
}

export interface Session {
  username: string;
  expiresAt: number; // epoch ms
}
