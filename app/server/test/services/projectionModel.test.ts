import assert from 'node:assert/strict';
import {
  availabilityFor,
  chanceAtLeast,
  clubStrengths,
  expectedPerEvery,
  headToHeadFactor,
  type ModelFixture,
  type ModelPlayer,
  type PlayerSample,
  projectFixture,
} from '../../src/services/projectionModel.js';

const close = (actual: number, expected: number, tolerance = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≉ ${expected}`);

function sample(overrides: Partial<PlayerSample> = {}): PlayerSample {
  return {
    minutes: 900,
    starts: 10,
    expectedGoals: 4,
    expectedAssists: 2,
    bonus: 5,
    saves: 0,
    yellowCards: 1,
    redCards: 0,
    defensiveContribution: 60,
    ...overrides,
  };
}

function player(overrides: Partial<ModelPlayer> = {}): ModelPlayer {
  return { position: 'MID', current: sample(), prior: null, clubMatches: 10, ...overrides };
}

const AVERAGE = { attack: 1, defence: 1 };
const fixture = (overrides: Partial<ModelFixture> = {}): ModelFixture => ({
  isHome: true,
  club: AVERAGE,
  opponent: AVERAGE,
  headToHeadFactor: 1,
  ...overrides,
});
const LEAGUE = { goalsPerMatch: 1.4 };

describe('projectionModel', () => {
  describe('clubStrengths', () => {
    it('rates clubs against the league average, steadied towards 1', () => {
      const league = clubStrengths(
        new Map([
          ['ARS', { matches: 10, goalsFor: 20, goalsAgainst: 8 }],
          ['LIV', { matches: 10, goalsFor: 8, goalsAgainst: 20 }],
        ]),
      );
      close(league.goalsPerMatch, 1.4);
      const ars = league.strengths.get('ARS')!;
      const liv = league.strengths.get('LIV')!;
      // (20 + 6 × 1.4) / 16 / 1.4: better than average, but less extreme than 2.0 / 1.4.
      close(ars.attack, (20 + 6 * 1.4) / 16 / 1.4);
      assert.ok(ars.attack > 1 && ars.attack < 20 / 10 / 1.4);
      assert.ok(ars.defence < 1);
      assert.ok(liv.attack < 1 && liv.defence > 1);
    });

    it('treats clubs with no matches as average', () => {
      const league = clubStrengths(new Map([['NEW', { matches: 0, goalsFor: 0, goalsAgainst: 0 }]]));
      assert.equal(league.goalsPerMatch, 1.4);
      close(league.strengths.get('NEW')!.attack, 1);
      close(league.strengths.get('NEW')!.defence, 1);
    });
  });

  describe('headToHeadFactor', () => {
    it('is neutral without at least 2 meetings or an overall average', () => {
      assert.equal(headToHeadFactor(undefined, 4), 1);
      assert.equal(headToHeadFactor({ meetings: 1, averagePoints: 15 }, 4), 1);
      assert.equal(headToHeadFactor({ meetings: 3, averagePoints: 8 }, undefined), 1);
    });

    it('nudges up for a good record and down for a poor one', () => {
      // ratio 2, confidence 0.3 × 4/8 = 0.15 → 1.15
      close(headToHeadFactor({ meetings: 4, averagePoints: 8 }, 4), 1.15);
      close(headToHeadFactor({ meetings: 4, averagePoints: 2 }, 4), 1 - 0.15 * 0.5);
    });

    it('is capped at ±15 % and can be switched off', () => {
      close(headToHeadFactor({ meetings: 4, averagePoints: 40 }, 4, 1), 1.15);
      close(headToHeadFactor({ meetings: 4, averagePoints: 0 }, 4, 1), 0.85);
      assert.equal(headToHeadFactor({ meetings: 4, averagePoints: 40 }, 4, 0), 1);
    });
  });

  describe('Poisson helpers', () => {
    it('expectedPerEvery matches a direct sum', () => {
      // mean 1: P(2)=e⁻¹/2, P(3)=e⁻¹/6 … floor(n/2) weights.
      let direct = 0;
      let p = Math.exp(-1);
      for (let n = 1; n < 40; n++) {
        p *= 1 / n;
        direct += Math.floor(n / 2) * p;
      }
      close(expectedPerEvery(1, 2), direct);
      assert.equal(expectedPerEvery(0, 3), 0);
    });

    it('chanceAtLeast', () => {
      close(chanceAtLeast(2, 1), 1 - Math.exp(-2));
      assert.equal(chanceAtLeast(5, 0), 1);
    });
  });

  describe('projectFixture', () => {
    it('breaks the prediction down into scoring rules that add up to the total', () => {
      const estimate = projectFixture(player(), fixture(), LEAGUE, 1);
      const sum = Object.values(estimate.breakdown).reduce((a, b) => a + b, 0);
      close(estimate.points, sum);
      assert.ok(estimate.points > 2 && estimate.points < 8, `points ${estimate.points}`);
      assert.ok(estimate.breakdown.cards < 0);
      assert.equal(estimate.breakdown.saves, 0);
      assert.equal(estimate.breakdown.goalsConceded, 0); // midfielders don't lose points for goals conceded
    });

    it('predicts nothing for an unavailable player', () => {
      const estimate = projectFixture(player(), fixture(), LEAGUE, 0);
      assert.equal(estimate.points, 0);
      assert.equal(estimate.expectedMinutes, 0);
    });

    it('scales with availability through minutes', () => {
      const fit = projectFixture(player(), fixture(), LEAGUE, 1);
      const doubtful = projectFixture(player(), fixture(), LEAGUE, 0.5);
      close(doubtful.expectedMinutes, fit.expectedMinutes / 2);
      close(doubtful.points, fit.points / 2);
    });

    it('expects more goals against a weak defence, and more at home', () => {
      const weak = projectFixture(player(), fixture({ opponent: { attack: 1, defence: 1.4 } }), LEAGUE, 1);
      const strong = projectFixture(player(), fixture({ opponent: { attack: 1, defence: 0.7 } }), LEAGUE, 1);
      const away = projectFixture(player(), fixture({ isHome: false }), LEAGUE, 1);
      const home = projectFixture(player(), fixture(), LEAGUE, 1);
      assert.ok(weak.expectedGoals > strong.expectedGoals);
      assert.ok(home.expectedGoals > away.expectedGoals);
      assert.ok(home.cleanSheetChance > away.cleanSheetChance);
    });

    it('gives defenders clean-sheet points and a goals-conceded penalty, forwards neither', () => {
      const defender = projectFixture(player({ position: 'DEF' }), fixture(), LEAGUE, 1);
      const forward = projectFixture(player({ position: 'FWD' }), fixture(), LEAGUE, 1);
      assert.ok(defender.breakdown.cleanSheet > 0);
      assert.ok(defender.breakdown.goalsConceded < 0);
      assert.equal(forward.breakdown.cleanSheet, 0);
      assert.equal(forward.breakdown.goalsConceded, 0);
      close(defender.cleanSheetChance, Math.exp(-1.4 / 1.1));
    });

    it('scores saves for goalkeepers only', () => {
      const keeper = projectFixture(
        player({ position: 'GK', current: sample({ saves: 30, expectedGoals: 0, expectedAssists: 0 }) }),
        fixture(),
        LEAGUE,
        1,
      );
      assert.ok(keeper.breakdown.saves > 0);
      assert.equal(keeper.breakdown.defensiveContribution, 0);
    });

    it('steadies small samples with last season, or the position average', () => {
      const hotStart = sample({ minutes: 90, starts: 1, expectedGoals: 2 });
      const noPrior = projectFixture(player({ current: hotStart, clubMatches: 1 }), fixture(), LEAGUE, 1);
      const quietPrior = projectFixture(
        player({ current: hotStart, clubMatches: 1, prior: sample({ minutes: 2700, starts: 30, expectedGoals: 3 }) }),
        fixture(),
        LEAGUE,
        1,
      );
      // 2 xG in 90 minutes would be ~2 goals a match; steadied, it's far less. A quiet last season
      // (0.1 xG per 90) pulls the rate per minute down further than the midfield average (0.15).
      const perMinute = (e: { expectedGoals: number; expectedMinutes: number }) => e.expectedGoals / e.expectedMinutes;
      assert.ok(noPrior.expectedGoals < 0.5);
      assert.ok(perMinute(quietPrior) < perMinute(noPrior));
    });

    it('applies the head-to-head factor to goals and assists', () => {
      const base = projectFixture(player(), fixture(), LEAGUE, 1);
      const boosted = projectFixture(player(), fixture({ headToHeadFactor: 1.1 }), LEAGUE, 1);
      close(boosted.expectedGoals, base.expectedGoals * 1.1);
      close(boosted.breakdown.bonus, base.breakdown.bonus * 1.1);
      close(boosted.breakdown.appearance, base.breakdown.appearance);
    });

    it('uses start share for rotation players', () => {
      const regular = projectFixture(player(), fixture(), LEAGUE, 1);
      const rotated = projectFixture(player({ current: sample({ starts: 3, minutes: 300 }) }), fixture(), LEAGUE, 1);
      assert.ok(rotated.startChance < regular.startChance);
      assert.ok(rotated.expectedMinutes < regular.expectedMinutes);
    });
  });

  describe('availabilityFor', () => {
    it('uses FPL’s chance of playing for the next gameweek', () => {
      assert.equal(availabilityFor('a', null, 0), 1);
      assert.equal(availabilityFor('d', 75, 0), 0.75);
      assert.equal(availabilityFor('d', null, 0), 0.5);
      assert.equal(availabilityFor('i', 0, 0), 0);
    });

    it('assumes recovery over about 3 gameweeks', () => {
      close(availabilityFor('i', 0, 1), 1 / 3);
      assert.equal(availabilityFor('i', 0, 3), 1);
      close(availabilityFor('d', 50, 2), 0.5 + 0.5 * (2 / 3));
    });

    it('keeps players who left or are not registered unavailable', () => {
      assert.equal(availabilityFor('u', null, 4), 0);
      assert.equal(availabilityFor('n', 100, 0), 0);
    });
  });
});
