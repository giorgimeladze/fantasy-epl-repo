import assert from 'node:assert/strict';
import { config } from '../../src/config.js';
import { authService } from '../../src/services/authService.js';

describe('authService', () => {
  it('issues a session token for the configured admin credentials', () => {
    const result = authService.login('admin', 'Qwerty12!');

    assert.ok(result);
    assert.match(result.token, /^[0-9a-f]{64}$/);
    assert.equal(result.username, 'admin');
    assert.ok(authService.getSession(result.token));
  });

  it('rejects a wrong password or username', () => {
    assert.equal(authService.login('admin', 'qwerty12!'), null);
    assert.equal(authService.login('Admin', 'Qwerty12!'), null);
    assert.equal(authService.login('', ''), null);
  });

  it('expires sessions after the configured TTL', () => {
    const result = authService.login('admin', 'Qwerty12!')!;
    const realNow = Date.now;
    try {
      Date.now = () => realNow() + config.auth.sessionTtlMs + 1;
      assert.equal(authService.getSession(result.token), null);
    } finally {
      Date.now = realNow;
    }
  });

  it('invalidates the token on logout', () => {
    const { token } = authService.login('admin', 'Qwerty12!')!;
    authService.logout(token);
    assert.equal(authService.getSession(token), null);
  });

  it('rejects every login when credentials are not configured', () => {
    const auth = config.auth as { username: string; password: string };
    const original = { ...auth };
    try {
      Object.assign(auth, { username: '', password: '' });
      assert.equal(authService.isConfigured(), false);
      assert.equal(authService.login('', ''), null);
    } finally {
      Object.assign(auth, original);
    }
  });

  it('returns null for unknown tokens', () => {
    assert.equal(authService.getSession('not-a-token'), null);
  });
});
