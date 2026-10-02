import assert from 'node:assert/strict';
import type { FixtureRecord } from '../../src/models/headToHead.js';
import { matchInsights, matchResult, summarize, toMatch } from '../../src/services/headToHeadInsights.js';

function record(overrides: Partial<FixtureRecord> = {}): FixtureRecord {
  return {
    season: '2025-26',
    playerCode: 1,
    fixtureId: 1,
    kickoffTime: '2025-11-01T15:00:00Z',
    gameweek: 10,
    teamShortName: 'ARS',
    opponentCode: 14,
    opponentShortName: 'LIV',
    wasHome: true,
    teamHScore: 1,
    teamAScore: 1,
    minutes: 90,
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
    totalPoints: 2,
    expectedGoals: 0,
    expectedAssists: 0,
    defensiveContribution: null,
    ...overrides,
  };
}

const labels = (r: FixtureRecord, position: Parameters<typeof matchInsights>[1]) =>
  matchInsights(r, position).map((i) => `${i.tone === 'good' ? '+' : '-'}${i.label}`);

describe('headToHeadInsights', () => {
  describe('matchResult', () => {
    it('reads the score from the player’s side', () => {
      assert.equal(matchResult(record({ wasHome: true, teamHScore: 2, teamAScore: 0 })), 'W');
      assert.equal(matchResult(record({ wasHome: false, teamHScore: 2, teamAScore: 0 })), 'L');
      assert.equal(matchResult(record({ wasHome: false, teamHScore: 1, teamAScore: 1 })), 'D');
      assert.equal(matchResult(record({ teamHScore: null })), null);
    });
  });

  describe('matchInsights', () => {
    it('lists attacking returns and bonus as positives', () => {
      assert.deepEqual(labels(record({ goals: 2, assists: 1, bonus: 3, totalPoints: 18 }), 'MID'), [
        '+2 goals',
        '+Assist',
        '++3 bonus', // tone marker + the label "+3 bonus"
      ]);
    });

    it('credits clean sheets to every position except forwards', () => {
      const cs = record({ cleanSheets: 1, goalsConceded: 0, totalPoints: 6 });
      assert.ok(labels(cs, 'DEF').includes('+Clean sheet'));
      assert.ok(labels(cs, 'MID').includes('+Clean sheet'));
      assert.ok(!labels(cs, 'FWD').includes('+Clean sheet'));
    });

    it('counts saves only for goalkeepers, from 3 upwards', () => {
      assert.ok(labels(record({ saves: 4 }), 'GK').includes('+4 saves'));
      assert.ok(!labels(record({ saves: 2 }), 'GK').some((l) => l.includes('saves')));
      assert.ok(!labels(record({ saves: 4 }), 'DEF').some((l) => l.includes('saves')));
    });

    it('applies position-specific defensive contribution thresholds', () => {
      assert.ok(labels(record({ defensiveContribution: 10 }), 'DEF').includes('+Defensive contribution'));
      assert.ok(!labels(record({ defensiveContribution: 10 }), 'MID').includes('+Defensive contribution'));
      assert.ok(labels(record({ defensiveContribution: 12 }), 'MID').includes('+Defensive contribution'));
      assert.ok(!labels(record({ defensiveContribution: 20 }), 'GK').includes('+Defensive contribution'));
    });

    it('flags things that cost points', () => {
      const bad = record({
        minutes: 55,
        yellowCards: 1,
        redCards: 1,
        ownGoals: 1,
        penaltiesMissed: 1,
        goalsConceded: 3,
        totalPoints: -4,
      });
      assert.deepEqual(labels(bad, 'DEF'), [
        "-Only 55'",
        '-Conceded 3',
        '-Yellow card',
        '-Red card',
        '-Own goal',
        '-Missed penalty',
        '-Blank',
      ]);
    });

    it('only penalises goals conceded for goalkeepers and defenders', () => {
      assert.ok(!labels(record({ goalsConceded: 3 }), 'MID').includes('-Conceded 3'));
    });

    it('marks a quiet game as a blank', () => {
      assert.deepEqual(labels(record(), 'FWD'), ['-Blank']);
    });
  });

  describe('summarize', () => {
    it('totals the matches and gives a verdict by average points', () => {
      const matches = [
        toMatch(record({ goals: 1, bonus: 2, totalPoints: 9 }), 'MID'),
        toMatch(record({ assists: 1, yellowCards: 1, totalPoints: 4 }), 'MID'),
        toMatch(record({ cleanSheets: 1, totalPoints: 6 }), 'MID'),
      ];
      assert.deepEqual(summarize(matches), {
        matches: 3,
        averagePoints: 6.3,
        totalPoints: 19,
        goals: 1,
        assists: 1,
        cleanSheets: 1,
        bonus: 2,
        cards: 1,
        verdict: 'good',
      });
    });

    it('grades average and poor records', () => {
      assert.equal(summarize([toMatch(record({ totalPoints: 4 }), 'MID')]).verdict, 'average');
      assert.equal(summarize([toMatch(record({ totalPoints: 1 }), 'MID')]).verdict, 'poor');
      assert.equal(summarize([]).verdict, 'none');
    });

    it('drops internal codes from the match payload', () => {
      const match = toMatch(record(), 'MID');
      assert.ok(!('playerCode' in match));
      assert.ok(!('opponentCode' in match));
    });
  });
});
