// Rotation pairs for the planner: goalkeepers (each club's first choice, within a budget) and
// defences (expected clean sheets), scored by the pure bestPairs in rotation.ts.
import { config } from '../config/index.js';
import type { PlayerProjection } from '../projections/models.js';
import type { DecisionContext } from '../shared/decision/decisionContext.js';
import { EPSILON, round2, sum } from '../shared/numbers.js';
import { isAvailable } from '../shared/positions.js';
import { plannerPlayer } from './mappers.js';
import type { Rotation, RotationPair } from './models.js';
import { bestPairs, type ClubSeries } from './rotation.js';

export function rotationAdvice(context: DecisionContext): Rotation {
  const { gameweeks, players } = context;
  const { rotationPairsShown: count, rotationMinStarts, goalkeeperPairMaxPrice } = config.planner;
  const byClub = new Map<string, PlayerProjection[]>();
  for (const p of players.values()) byClub.set(p.clubShortName, [...(byClub.get(p.clubShortName) ?? []), p]);

  // Goalkeepers: each club's first choice (most predicted points over the horizon).
  const keepers = new Map(
    [...byClub].flatMap(([club, list]) => {
      const keeper = list
        .filter((p) => p.position === 'GK' && isAvailable(p))
        .sort((a, b) => b.horizonPoints - a.horizonPoints)[0];
      return keeper ? [[club, keeper] as const] : [];
    }),
  );
  const keeperSeries: ClubSeries[] = [...keepers].map(([club, k]) => ({
    club,
    values: k.gameweeks.map((g) => g.points),
  }));
  const affordable = (a: ClubSeries, b: ClubSeries) =>
    keepers.get(a.club)!.price + keepers.get(b.club)!.price <= goalkeeperPairMaxPrice + EPSILON;
  const goalkeepers: RotationPair[] = bestPairs(keeperSeries, gameweeks, count, rotationMinStarts, affordable).map(
    (pair) => {
      const pairKeepers = pair.clubs.map((club) => keepers.get(club)!);
      return {
        ...pair,
        players: pairKeepers.map((k) => plannerPlayer(context, k.id, k.horizonPoints)),
        price: round2(sum(pairKeepers.map((k) => k.price))),
      };
    },
  );

  // Defences: expected clean sheets per gameweek (every player at a club shares its fixtures).
  const defenceSeries: ClubSeries[] = [...byClub].map(([club, list]) => ({
    club,
    values: gameweeks.map((_, w) => sum((list[0]?.gameweeks[w]?.fixtures ?? []).map((f) => f.cleanSheetChance))),
  }));
  const defences: RotationPair[] = bestPairs(defenceSeries, gameweeks, count, rotationMinStarts).map((pair) => ({
    ...pair,
    players: [],
    price: 0,
  }));

  return { goalkeepers, defences };
}
