// Chip advice for the planner: each chip's value per gameweek in the horizon, the best week and a
// one-line verdict. The values come from the pure helpers in chips.ts and squadBuilder.ts.
import { config } from '../config/index.js';
import type { DecisionContext } from '../shared/decision/decisionContext.js';
import { searchFromContext } from '../shared/decision/transferOption.js';
import type { SquadPlayer } from '../shared/decision/transferSearch.js';
import { EPSILON, round2, sum, tenths } from '../shared/numbers.js';
import { benchBoostValue, chipStatus, type LineupWeek, lineupWeek, tripleCaptainValue } from './chips.js';
import { candidatesFor, plannerPlayer, pts } from './mappers.js';
import type { ChipAdvice, ChipStatus, ChipWeek, PlannerPlayer } from './models.js';
import { buildBestSquad, forGameweeks } from './squadBuilder.js';

const names = (players: readonly PlannerPlayer[]) => players.map((p) => `${p.webName} ${pts(p.points)}`).join(', ');

function unavailableVerdict(status: ChipStatus): string {
  return status.playedInGameweek
    ? `Already played in GW${status.playedInGameweek}.`
    : 'Not available in this part of the season.';
}

/** The chip's best gameweek in its window (value above 0), with the verdict line. */
function pickBest(status: ChipStatus, weeks: ChipWeek[], describe: (week: ChipWeek) => string) {
  if (!status.available) return { bestGameweek: null, verdict: unavailableVerdict(status) };
  const eligible = weeks.filter((w) => status.availableUntil === null || w.gameweek <= status.availableUntil);
  const best = eligible.reduce<ChipWeek | null>((top, w) => (w.value > (top?.value ?? 0) + EPSILON ? w : top), null);
  if (!best) return { bestGameweek: null, verdict: 'Adds nothing in the coming gameweeks.' };
  const deadline = status.availableUntil !== null ? ` Must be played by GW${status.availableUntil}.` : '';
  return { bestGameweek: best.gameweek, verdict: `${describe(best)}${deadline}` };
}

const squadSearchOptions = () => ({
  maxPerClub: config.transfers.maxPerClub,
  candidatesPerPosition: config.planner.squadSearchCandidates,
  maxSteps: config.planner.squadSearchMaxSteps,
});

const fixtureCount = (context: DecisionContext, id: number, week: number) =>
  context.players.get(id)?.gameweeks[week]?.fixtures.length ?? 0;

function benchBoost(context: DecisionContext, lineups: LineupWeek[]): ChipAdvice {
  const status = chipStatus('bboost', context.bootstrap.chips, context.chipsPlayed, context.gameweek);
  const weeks = lineups.map((week, w): ChipWeek => ({
    gameweek: context.gameweeks[w]!,
    value: round2(benchBoostValue(week)),
    explanation: `bench ${pts(week.benchPoints)} − ${pts(week.autosubPoints)} already expected from autosubs`,
    players: week.bench.map((c) => plannerPlayer(context, c.id, c.points)),
  }));
  return {
    chip: status,
    ...pickBest(status, weeks, (w) => `Best in GW${w.gameweek}: +${pts(w.value)} (${names(w.players)}).`),
    method:
      "Your best lineup each gameweek: the bench players' predicted points, "
      + 'minus what automatic substitutions would bring in anyway.',
    weeks,
  };
}

function tripleCaptain(context: DecisionContext, lineups: LineupWeek[]): ChipAdvice {
  const status = chipStatus('3xc', context.bootstrap.chips, context.chipsPlayed, context.gameweek);
  const weeks = lineups.map((week, w): ChipWeek => {
    const doubled = fixtureCount(context, week.captain.id, w) > 1 ? ', double gameweek' : '';
    const captain = plannerPlayer(context, week.captain.id, week.captain.points);
    return {
      gameweek: context.gameweeks[w]!,
      value: round2(tripleCaptainValue(week)),
      explanation:
        `captain ${captain.webName} ${pts(week.captain.points)} once more${doubled} (vice-captain covering included)`,
      players: [captain],
    };
  });
  return {
    chip: status,
    ...pickBest(status, weeks, (w) => `Best in GW${w.gameweek}: +${pts(w.value)} with ${w.players[0]?.webName}.`),
    method:
      "Your best captain each gameweek scores once more (if he doesn't play, the vice-captain's points count). "
      + 'Double gameweeks add both fixtures.',
    weeks,
  };
}

/** Free Hit: the best squad for that one week, against yours. */
function freeHit(context: DecisionContext): ChipAdvice {
  const { squad, league, bank, gameweeks } = context;
  const status = chipStatus('freehit', context.bootstrap.chips, context.chipsPlayed, context.gameweek);
  const ownIds = new Set(squad.map((p) => p.id));
  const weeks = gameweeks.map((gameweek, w): ChipWeek => {
    const [mine, market] = [forGameweeks(squad, w, w + 1), forGameweeks(league, w, w + 1)];
    const built = buildBestSquad(mine, market, bank, squadSearchOptions());
    const [after, before] = [built.perGameweek[0] ?? 0, built.baseline[0] ?? 0];
    const blanks = squad.filter((p) => fixtureCount(context, p.id, w) === 0).length;
    return {
      gameweek,
      value: round2(after - before),
      explanation: `Free Hit squad ${pts(after)} vs yours ${pts(before)}`
        + (blanks ? ` (${blanks} of yours without a fixture)` : ''),
      players: built.squad
        .filter((p) => !ownIds.has(p.id))
        .map((p) => plannerPlayer(context, p.id, p.gameweeks[0]?.points ?? 0)),
    };
  });
  return {
    chip: status,
    ...pickBest(status, weeks, (w) => `Best in GW${w.gameweek}: +${pts(w.value)}.`),
    method:
      'For each gameweek, the best squad for that week alone from your budget, against your squad. '
      + 'Biggest in blank gameweeks.',
    weeks,
  };
}

/** Wildcard: the best squad for the whole horizon, against yours and against the best normal transfers. */
function wildcard(context: DecisionContext): ChipAdvice {
  const { squad, league, bank, gameweeks, gameweek } = context;
  const { wildcardMinGain } = config.planner;
  const status = chipStatus('wildcard', context.bootstrap.chips, context.chipsPlayed, gameweek);
  const range = `GW${gameweeks[0]}–${gameweeks.at(-1)}`;

  const built = buildBestSquad(squad, league, bank, squadSearchOptions());
  const gain = sum(built.perGameweek) - sum(built.baseline);
  const bestTransfers = searchFromContext(context).recommended.netGain;
  const extra = gain - bestTransfers;
  const worthIt = status.available && extra >= wildcardMinGain;

  const verdict = !status.available
    ? unavailableVerdict(status)
    : worthIt
      ? `Worth considering now: ${pts(gain)} over ${range}, ${pts(extra)} more than the best transfers.`
      : `Not yet: ${pts(gain)} over ${range}, only ${pts(extra)} more than the best transfers `
        + `(needs ${wildcardMinGain}).`;

  const ownIds = new Set(squad.map((p) => p.id));
  const builtIds = new Set(built.squad.map((p) => p.id));
  const horizon = (p: SquadPlayer) => sum(p.gameweeks.map((g) => g.points));
  return {
    chip: status,
    bestGameweek: worthIt ? gameweek : null,
    verdict,
    method:
      `Builds the best squad for ${range} from your budget (bank + selling prices) by repeated best transfers, `
      + "then compares it with your squad and with the Transfers page's recommendation. "
      + `Suggested when it adds ${wildcardMinGain}+ points more than those transfers (a rule of thumb).`,
    weeks: gameweeks.map((gw, w): ChipWeek => ({
      gameweek: gw,
      value: round2((built.perGameweek[w] ?? 0) - (built.baseline[w] ?? 0)),
      explanation: `Wildcard squad ${pts(built.perGameweek[w] ?? 0)} vs yours ${pts(built.baseline[w] ?? 0)}`,
      players: [],
    })),
    wildcard: {
      in: built.squad.filter((p) => !ownIds.has(p.id)).map((p) => plannerPlayer(context, p.id, horizon(p))),
      out: squad.filter((p) => !builtIds.has(p.id)).map((p) => plannerPlayer(context, p.id, horizon(p))),
      gain: round2(gain),
      bestTransfersGain: round2(bestTransfers),
      bankAfter: tenths(built.bank),
    },
  };
}

/** Wildcard, Free Hit, Bench Boost and Triple Captain, in that order. */
export function chipAdvice(context: DecisionContext): ChipAdvice[] {
  const lineups = context.gameweeks.map((_, w) => lineupWeek(candidatesFor(context.squad, w)));
  return [wildcard(context), freeHit(context), benchBoost(context, lineups), tripleCaptain(context, lineups)];
}
