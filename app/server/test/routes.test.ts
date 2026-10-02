import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { fixtureHistoryRepository } from '../src/db/fixtureHistoryRepository.js';
import { responseCacheRepository } from '../src/db/responseCacheRepository.js';
import { teamCacheRepository } from '../src/db/teamCacheRepository.js';
import { type FplApiMock, mockFplApi } from './helpers/mockFplApi.js';

const app = createApp();

async function login(): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'Qwerty12!' });
  assert.equal(res.status, 200);
  return res.body.token as string;
}

describe('HTTP routes', () => {
  let fpl: FplApiMock;

  beforeEach(() => {
    teamCacheRepository().clear();
    responseCacheRepository().clear();
    fixtureHistoryRepository().clear();
    fpl = mockFplApi();
  });

  afterEach(() => fpl.restore());

  it('GET /api/health', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 'ok' });
  });

  describe('POST /api/auth/login', () => {
    it('returns a token for valid credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'Qwerty12!' });
      assert.equal(res.status, 200);
      assert.equal(typeof res.body.token, 'string');
      assert.equal(res.body.username, 'admin');
    });

    it('returns 401 for invalid credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'nope' });
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Invalid username or password');
    });

    it('returns 400 when fields are missing', async () => {
      const res = await request(app).post('/api/auth/login').send({ username: 'admin' });
      assert.equal(res.status, 400);
    });
  });

  describe('GET /api/team', () => {
    it('requires authentication', async () => {
      const res = await request(app).get('/api/team');
      assert.equal(res.status, 401);
      assert.deepEqual(fpl.calls, []);
    });

    it('rejects an invalid token', async () => {
      const res = await request(app).get('/api/team').set('Authorization', 'Bearer nope');
      assert.equal(res.status, 401);
    });

    it('returns the team, then serves it from the cache', async () => {
      const token = await login();

      const first = await request(app).get('/api/team').set('Authorization', `Bearer ${token}`);
      assert.equal(first.status, 200);
      assert.equal(first.body.players.length, 15);
      assert.equal(first.body.manager.teamName, 'Mock Mid Table FC');
      assert.equal(first.body.cache.fromCache, false);

      fpl.calls.length = 0;
      const second = await request(app).get('/api/team').set('Authorization', `Bearer ${token}`);
      assert.equal(second.body.cache.fromCache, true);
      assert.deepEqual(fpl.calls, []);
    });

    it('?refresh=true bypasses the cache', async () => {
      const token = await login();
      await request(app).get('/api/team').set('Authorization', `Bearer ${token}`);

      const res = await request(app).get('/api/team?refresh=true').set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.cache.fromCache, false);
    });

    it('passes FPL outages through as JSON errors', async () => {
      fpl.restore();
      fpl = mockFplApi({ '/bootstrap-static/': { status: 503 } });
      const token = await login();

      const res = await request(app).get('/api/team').set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 503);
      assert.match(res.body.error, /updating/);
    });
  });

  describe('GET /api/head-to-head', () => {
    it('requires authentication', async () => {
      const res = await request(app).get('/api/head-to-head');
      assert.equal(res.status, 401);
    });

    it('returns every squad player with their record against the next opponent', async () => {
      const token = await login();

      const res = await request(app).get('/api/head-to-head').set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.players.length, 15);
      const salah = res.body.players.find((p: { player: { webName: string } }) => p.player.webName === 'M.Salah');
      assert.equal(salah.matches.length, 4);
      assert.equal(res.body.cache.fromCache, false);

      const again = await request(app).get('/api/head-to-head').set('Authorization', `Bearer ${token}`);
      assert.equal(again.body.cache.fromCache, true);
    });
  });

  describe('scout endpoints', () => {
    it('require authentication', async () => {
      assert.equal((await request(app).get('/api/head-to-head/options')).status, 401);
      assert.equal((await request(app).get('/api/head-to-head/players/9')).status, 401);
    });

    it('GET /api/head-to-head/options lists clubs and players', async () => {
      const token = await login();
      const res = await request(app).get('/api/head-to-head/options').set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.clubs.length, 4);
    });

    it('GET /api/head-to-head/players/:id returns one player', async () => {
      const token = await login();
      const res = await request(app).get('/api/head-to-head/players/9').set('Authorization', `Bearer ${token}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.player.webName, 'M.Salah');
      assert.equal(res.body.matches.length, 4);
    });

    it('validates the player id', async () => {
      const token = await login();
      const bad = await request(app).get('/api/head-to-head/players/abc').set('Authorization', `Bearer ${token}`);
      assert.equal(bad.status, 400);
      const missing = await request(app).get('/api/head-to-head/players/9999').set('Authorization', `Bearer ${token}`);
      assert.equal(missing.status, 404);
    });
  });

  it('POST /api/auth/logout invalidates the token', async () => {
    const token = await login();

    const logout = await request(app).post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    assert.equal(logout.status, 204);

    const res = await request(app).get('/api/auth/session').set('Authorization', `Bearer ${token}`);
    assert.equal(res.status, 401);
  });

  it('returns JSON 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/nope');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
  });
});
