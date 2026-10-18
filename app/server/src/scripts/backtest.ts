// Scores the predicted-points model against a past season: `npm run backtest [-- 2025-26]`.
// Downloads past seasons into SQLite first if they aren't there yet.
import { config } from '../config.js';
import { fixtureHistoryRepository } from '../db/fixtureHistoryRepository.js';
import type { Position } from '../models/team.js';
import { type BacktestScores, runBacktest } from '../services/backtest.js';
import { historyImporter, previousSeasons, seasonLabel } from '../services/historyImporter.js';

const now = new Date();
const startYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
const seasons = await historyImporter.ensureSeasons(previousSeasons(startYear, config.history.pastSeasons));
const season = process.argv[2] ?? seasons[0];
if (!season || !seasons.includes(season)) {
  console.error(`Season ${season ?? '(none)'} is not available. Available: ${seasons.join(', ')}`);
  process.exit(1);
}

const repository = fixtureHistoryRepository();
const seasonStart = Number(season.slice(0, 4));
const priorLabel = seasonLabel(seasonStart - 1);
const prior = seasons.includes(priorLabel) ? repository.playerSeasonTotals(priorLabel) : new Map();
const records = repository.seasonRecords(season);
const headToHead = repository.headToHeadAverages(season, config.history.matchesPerPlayer);

const withH2h = runBacktest(season, records, prior, headToHead);
const withoutH2h = runBacktest(season, records, prior, headToHead, { headToHeadWeight: 0 });

const row = (label: string, s: BacktestScores, noH2h?: BacktestScores) => ({
  '': label,
  samples: s.samples,
  'model MAE': s.model.meanAbsoluteError,
  'model bias': s.model.bias,
  'model MAE (no h2h)': noH2h?.model.meanAbsoluteError ?? '',
  'baseline MAE': s.baseline.meanAbsoluteError,
  // On the gameweeks where the dataset has FPL's own forecast:
  'xP samples': s.versusFpl?.samples ?? 0,
  'xP GWs: model MAE': s.versusFpl?.model.meanAbsoluteError ?? 'n/a',
  'xP GWs: FPL MAE': s.versusFpl?.fpl.meanAbsoluteError ?? 'n/a',
});

console.log(
  `\nBacktest ${season}, GW${withH2h.fromGameweek}–${withH2h.toGameweek} (prior: ${prior.size ? priorLabel : 'none'})`,
);
console.table([
  row('All', withH2h, withoutH2h),
  ...(['GK', 'DEF', 'MID', 'FWD'] as Position[]).map((p) => row(p, withH2h.byPosition[p], withoutH2h.byPosition[p])),
  row('Played 60+', withH2h.playedSixty, withoutH2h.playedSixty),
]);
console.log("'Played 60+' is the fairer comparison with FPL: its xP knows team news, the dataset doesn't.");
console.log(
  'MAE = mean absolute error in points per player per gameweek (lower is better); bias > 0 = predicts too high.',
);
