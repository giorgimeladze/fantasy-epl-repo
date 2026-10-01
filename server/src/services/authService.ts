import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import type { LoginResponse, Session } from '../models/auth.js';

const sessions = new Map<string, Session>();

function safeEqual(a: string, b: string): boolean {
  // Hash first so both buffers have equal length and comparison time doesn't leak length.
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

function pruneExpired(now: number): void {
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

export const authService = {
  isConfigured(): boolean {
    return config.auth.username !== '' && config.auth.password !== '';
  },

  login(username: string, password: string): LoginResponse | null {
    // Without this, empty credentials would match an unconfigured (empty) account.
    if (!authService.isConfigured()) return null;

    const validUser = safeEqual(username, config.auth.username);
    const validPassword = safeEqual(password, config.auth.password);
    if (!validUser || !validPassword) return null;

    const now = Date.now();
    pruneExpired(now);

    const token = randomBytes(32).toString('hex');
    const expiresAt = now + config.auth.sessionTtlMs;
    sessions.set(token, { username, expiresAt });
    return { token, username, expiresAt: new Date(expiresAt).toISOString() };
  },

  getSession(token: string): Session | null {
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      sessions.delete(token);
      return null;
    }
    return session;
  },

  logout(token: string): void {
    sessions.delete(token);
  },
};
