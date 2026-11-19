import assert from 'node:assert/strict';
import type { DraftPlanResponse } from '../src/planner/models.js';
import { api, apiClient, bootstrap, fplCalls, fplReturns, friendApi, FRIEND_TEAM_ID, MOCK_TEAM_ID } from './setup.js';

const JACKSON = 14;

describe('Two accounts, one FPL team each', () => {
  describe('POST /api/auth/login', () => {
    it('logs the friend in to their own team', async () => {
      const res = await apiClient().login('friend', 'Asdfgh34!');

      assert.equal(res.status, 200);
      assert.equal(res.body.username, 'friend');
      assert.equal(res.body.teamId, FRIEND_TEAM_ID);
    });

    for (const [name, username, password] of [
      ['a wrong password', 'friend', 'nope'],
      ["the admin's password with the friend's username", 'friend', 'Qwerty12!'],
      ["the friend's password with the admin's username", 'admin', 'Asdfgh34!'],
      ['empty credentials', '', ''],
    ] as const) {
      it(`rejects ${name}`, async () => {
        const res = await apiClient().login(username, password);
        assert.equal(res.status, 401);
      });
    }
  });

  it('GET /api/auth/session names the account and its team', async () => {
    const res = await friendApi.session();
    assert.deepEqual(res.body, { username: 'friend', teamId: FRIEND_TEAM_ID });
  });

  it('shows each account its own team, cached separately', async () => {
    const mine = await api.team();
    const theirs = await friendApi.team();

    assert.equal(mine.body.manager.teamId, MOCK_TEAM_ID);
    assert.equal(mine.body.manager.teamName, 'Mock Mid Table FC');
    assert.equal(theirs.status, 200);
    assert.equal(theirs.body.manager.teamId, FRIEND_TEAM_ID);
    assert.equal(theirs.body.manager.teamName, 'Friendly Rivals XI');
    assert.equal(theirs.body.manager.managerName, 'Second Manager');
    assert.equal(theirs.body.cache.fromCache, false, "the admin's cached team is not reused");
  });

  it("builds the friend's transfer suggestions from the friend's FPL data only", async () => {
    const res = await friendApi.transfers();

    assert.equal(res.status, 200);
    assert.ok(fplCalls.includes(`/entry/${FRIEND_TEAM_ID}/transfers/`));
    assert.ok(!fplCalls.some((path) => path.startsWith(`/entry/${MOCK_TEAM_ID}/`)));
  });

  it("keeps each account's draft plan private", async () => {
    const b = bootstrap();
    const jackson = b.elements.find((e) => e.id === JACKSON)!;
    b.elements.push({ ...jackson, id: 100, code: 200000, web_name: 'Delap', now_cost: 55 });
    fplReturns('/bootstrap-static/', b);

    const saved = await api.saveDraft({ transfers: [{ gameweek: 3, outId: JACKSON, inId: 100 }] });
    assert.equal(saved.status, 200, saved.body.error);

    const theirs: DraftPlanResponse = (await friendApi.draft()).body;
    assert.equal(theirs.updatedAt, null);
    assert.deepEqual(theirs.weeks.flatMap((w) => w.moves), []);

    await friendApi.clearDraft();
    const mine: DraftPlanResponse = (await api.draft()).body;
    // The friend's clear leaves the admin's plan.
    assert.deepEqual(mine.weeks[0]!.moves.map((m) => m.in.webName), ['Delap']);
  });
});
