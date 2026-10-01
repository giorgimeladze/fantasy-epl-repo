// Auth contract. Mirrored in client/src/types.ts.

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
