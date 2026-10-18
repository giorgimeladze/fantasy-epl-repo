import assert from 'node:assert/strict';
import type { FixtureRecord } from '../../src/models/headToHead.js';
import type { Position } from '../../src/models/team.js';
import { runBacktest } from '../../src/services/backtest.js';

const NO_HISTORY = { byOpponent: new Map(), overall: new Map() };

interface Row {
  gw: number;
  code: number;
  club: 'AAA' | 'BBB';
  position: Position | null;
  minutes: number;
  points: number;
  xP: number;
}

function record({ gw, code, club, position, minutes, points, xP }: Row): FixtureRecord {
  const opponent = club === 'AAA' ? 'BBB' : 'AAA';
  return {
    season: '2025-26',
    playerCode: code,
    fixtureId: gw,
    kickoffTime: `2025-09-${String(gw).padStart(2, '0')}T15:00:00Z`,
    gameweek: gw,
    teamShortName: club,
    opponentCode: opponent === 'AAA' ? 1 : 2,
    opponentShortName: opponent,
    wasHome: (club === 'AAA') === (gw % 2 === 1),
    teamHScore: 1,
    teamAScore: 1,
    minutes,
    goals: 0,
    assists: 0,
    cleanSheets: 0,
    goalsConceded: 1,
    ownGoals: 0,
    penaltiesSaved: 0,
    penaltiesMissed: 0,
    yellowCards: 0,
    redCards: 0,
    saves: 0,
    bonus: 0,
    bps: 10,
    totalPoints: points,
    expectedGoals: minutes > 0 ? 0.3 : 0,
    expectedAssists: minutes > 0 ? 0.1 : 0,
    defensiveContribution: 5,
    position,
    starts: minutes >= 60 ? 1 : 0,
    expectedPoints: xP,
  };
}

/** Six gameweeks of AAA v BBB. FPL's xP is missing (0 for everyone) from GW5, like the real dataset. */
function season(): FixtureRecord[] {
  const rows: FixtureRecord[] = [];
  for (let gw = 1; gw <= 6; gw++) {
    const xP = gw <= 4 ? 4 : 0;
    rows.push(record({ gw, code: 1, club: 'AAA', position: 'MID', minutes: 90, points: gw % 2 ? 2 : 8, xP }));
    rows.push(record({ gw, code: 2, club: 'BBB', position: 'FWD', minutes: 90, points: 5, xP }));
    // Plays GW1 only, then drops out of the side.
    rows.push(
      record({ gw, code: 3, club: 'AAA', position: 'DEF', minutes: gw === 1 ? 90 : 0, points: gw === 1 ? 6 : 0, xP }),
    );
    // No position in the dataset: never scored.
    rows.push(record({ gw, code: 4, club: 'BBB', position: null, minutes: 90, points: 3, xP }));
  }
  return rows;
}

describe('runBacktest', () => {
  const result = runBacktest('2025-26', season(), new Map(), NO_HISTORY, { fromGameweek: 4 });

  it('scores the gameweeks from `fromGameweek` on', () => {
    assert.equal(result.season, '2025-26');
    assert.equal(result.fromGameweek, 4);
    assert.equal(result.toGameweek, 6);
  });

  it('only scores recent regulars with a known position', () => {
    // GW4–6 for players 1 and 2; player 3 still counts in GW4 (played in GW1, within the club's last 3).
    assert.equal(result.samples, 7);
    assert.equal(result.byPosition.MID.samples, 3);
    assert.equal(result.byPosition.FWD.samples, 3);
    assert.equal(result.byPosition.DEF.samples, 1);
    assert.equal(result.byPosition.GK.samples, 0);
  });

  it('compares with FPL only on gameweeks where the dataset has its forecast', () => {
    assert.ok(result.versusFpl);
    assert.equal(result.versusFpl.samples, 3); // GW4 only
    // FPL said 4 for each: |4−8| (player 1, GW4) + |4−5| + |4−0| = 9 over 3 samples.
    assert.equal(result.versusFpl.fpl.meanAbsoluteError, 3);
  });

  it('scores a season-average baseline', () => {
    // Player 2 always scores 5, so their average is exactly right; the others aren't.
    const fwd = result.byPosition.FWD;
    assert.equal(fwd.baseline.meanAbsoluteError, 0);
    assert.ok(fwd.model.meanAbsoluteError > 0);
  });

  it('reports players who went on to play 60+ minutes separately', () => {
    assert.equal(result.playedSixty.samples, 6);
  });

  it('keeps predictions in a sensible range', () => {
    assert.ok(result.model.meanAbsoluteError > 0 && result.model.meanAbsoluteError < 5);
    assert.ok(Number.isFinite(result.model.rootMeanSquaredError));
  });
});
