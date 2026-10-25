// Pure number helpers shared by every feature.

/** Tolerance for comparing predicted points (floating-point sums). */
export const EPSILON = 1e-9;

// `+ 0` turns −0 into 0, so a JSON round trip (the response cache) gives the same value.
export const round2 = (value: number): number => Math.round(value * 100) / 100 + 0;
export const round3 = (value: number): number => Math.round(value * 1000) / 1000 + 0;

/** FPL prices are integers in tenths of £m (`105` = £10.5m). */
export const tenths = (value: number): number => value / 10;

/** FPL's decimal strings (`"4.5"`); missing or unparsable is 0. */
export const decimal = (value: string | null | undefined): number => Number.parseFloat(value ?? '') || 0;

/** FPL's decimal strings; missing or unparsable is `null`. */
export function decimalOrNull(value: string | null | undefined): number | null {
  const n = Number.parseFloat(value ?? '');
  return Number.isNaN(n) ? null : n;
}

export const sum = (values: readonly number[]): number => values.reduce((total, v) => total + v, 0);
