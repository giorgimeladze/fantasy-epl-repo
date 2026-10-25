// Display formatting shared by every page. Values arrive ready to show (prices in £m, chances 0–1).
import type { CacheInfo, Position } from '../types.ts';

export const POSITIONS: readonly Position[] = ['GK', 'DEF', 'MID', 'FWD'];

/** Predicted points: `4.3`. */
export const pts = (value: number): string => value.toFixed(1);

/** A number with two decimals (rates, factors, xG): `0.42`. */
export const fixed = (value: number): string => value.toFixed(2);

/** A gain or loss with its sign: `+1.5`, `−0.3`. */
export const signed = (value: number): string => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`;

/** A price in £m: `£10.5m`. */
export const money = (value: number): string => `£${value.toFixed(1)}m`;

/** A chance (0–1) as a percentage: `75%`. */
export const pct = (value: number): string => `${Math.round(value * 100)}%`;

/** Clock time: `14:05`. */
export const time = (iso: string): string =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** A deadline: `Sat 29 Aug, 11:00`. */
export const deadline = (iso: string): string =>
  new Date(iso).toLocaleString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

/** `GW5`, `GW5–9`, or empty for no gameweeks. */
export function gameweekRange(gameweeks: readonly number[]): string {
  if (gameweeks.length === 0) return '';
  return gameweeks.length === 1 ? `GW${gameweeks[0]}` : `GW${gameweeks[0]}–${gameweeks.at(-1)}`;
}

/** `fetched at 14:05 (cached)`, for the line under a page title. */
export const fetchedAt = (cache: CacheInfo): string =>
  `fetched at ${time(cache.fetchedAt)}${cache.fromCache ? ' (cached)' : ''}`;

export const CHIP_NAMES: Record<string, string> = {
  wildcard: 'Wildcard',
  freehit: 'Free Hit',
  bboost: 'Bench Boost',
  '3xc': 'Triple Captain',
};
