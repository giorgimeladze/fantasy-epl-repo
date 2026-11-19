import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Account } from '../config/accounts.js';
import { config } from '../config/index.js';
import type { LoginResponse, Session } from './models.js';

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
  /** Every account has a username and a password. */
  isConfigured(): boolean {
    const accounts: readonly Account[] = config.auth.accounts;
    return accounts.length > 0 && accounts.every((a) => a.username !== '' && a.password !== '');
  },

  login(username: string, password: string): LoginResponse | null {
    // Without this, empty credentials would match an unconfigured (empty) account.
    if (!authService.isConfigured()) return null;

    // Checks every account, without stopping at a match, so timing doesn't reveal which usernames exist.
    let account: Account | null = null;
    for (const candidate of config.auth.accounts) {
      const validUser = safeEqual(username, candidate.username);
      const validPassword = safeEqual(password, candidate.password);
      if (validUser && validPassword && !account) account = candidate;
    }
    if (!account) return null;

    const now = Date.now();
    pruneExpired(now);

    const token = randomBytes(32).toString('hex');
    const expiresAt = now + config.auth.sessionTtlMs;
    sessions.set(token, { username: account.username, teamId: account.teamId, expiresAt });
    return { token, username: account.username, teamId: account.teamId, expiresAt: new Date(expiresAt).toISOString() };
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
