import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { ADMIN, login, loginAsAdmin, withClockAhead, withoutAdminCredentials } from './helpers/namespace.js';

describe('auth', () => {
  describe('POST /api/auth/login', () => {
    it('returns a session token for the configured admin credentials', async () => {
      const res = await login();

      assert.equal(res.status, 200);
      assert.match(res.body.token, /^[0-9a-f]{64}$/);
      assert.equal(res.body.username, ADMIN.username);
      const ttl = Date.parse(res.body.expiresAt) - Date.now();
      assert.ok(ttl > config.auth.sessionTtlMs - 5000 && ttl <= config.auth.sessionTtlMs);
    });

    it('returns 401 for a wrong password or username', async () => {
      for (const credentials of [
        { username: ADMIN.username, password: ADMIN.password.toLowerCase() },
        { username: ADMIN.username.toUpperCase(), password: ADMIN.password },
        { username: '', password: '' },
      ]) {
        const res = await login(credentials);
        assert.equal(res.status, 401);
        assert.equal(res.body.error, 'Invalid username or password');
      }
    });

    it('returns 400 when fields are missing', async () => {
      const res = await login({ username: ADMIN.username });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'username and password are required');
    });

    it('rejects every login when credentials are not configured', async () => {
      const res = await withoutAdminCredentials(async () => login({ username: '', password: '' }));
      assert.equal(res.status, 401);
    });
  });

  describe('sessions', () => {
    it('GET /api/auth/session returns the logged-in user', async () => {
      const admin = await loginAsAdmin();
      const res = await admin.session();
      assert.equal(res.status, 200);
      assert.deepEqual(res.body, { username: ADMIN.username });
    });

    it('expire after the configured TTL', async () => {
      const admin = await loginAsAdmin();
      const res = await withClockAhead(config.auth.sessionTtlMs + 1, () => admin.session());
      assert.equal(res.status, 401);
    });

    it('POST /api/auth/logout invalidates the token', async () => {
      const admin = await loginAsAdmin();

      assert.equal((await admin.logout()).status, 204);
      assert.equal((await admin.session()).status, 401);
    });
  });
});
