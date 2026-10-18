import assert from 'node:assert/strict';
import { fplCalls } from './helpers/mockFplApi.js';
import { anonymous, apiClient, useTestEnvironment } from './helpers/namespace.js';

describe('API', () => {
  useTestEnvironment();

  it('GET /api/health', async () => {
    const res = await anonymous.health();
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok' });
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await anonymous.get('/nope');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
  });

  for (const [name, client] of [
    ['no token', anonymous],
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
      ];

      for (const res of responses) {
        assert.equal(res.status, 401);
        assert.equal(res.body.error, 'Not authenticated');
      }
      assert.deepEqual(fplCalls, []);
    });
  }
});
