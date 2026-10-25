import assert from 'node:assert/strict';
import { api, apiClient, config, fplCalls } from './setup.js';

describe('API', () => {
  it('GET /api/health', async () => {
    const res = await apiClient().health();
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok' });
  });

  it('is logged in as the admin (see setup.ts)', async () => {
    const res = await api.session();
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { username: config.auth.username });
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await apiClient().get('/nope');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
  });

  for (const [name, client] of [
    ['no token', apiClient()],
    ['an invalid token', apiClient('nope')],
  ] as const) {
    it(`rejects every protected endpoint with ${name}, without calling FPL`, async () => {
      const responses = [
        await client.session(),
        await client.logout(),
        await client.team(),
        await client.headToHead(),
        await client.scoutOptions(),
        await client.scoutPlayer(9),
        await client.projections(),
        await client.nextGameweek(),
      ];

      for (const res of responses) {
        assert.equal(res.status, 401);
        assert.equal(res.body.error, 'Not authenticated');
      }
      assert.deepEqual(fplCalls, []);
    });
  }
});
