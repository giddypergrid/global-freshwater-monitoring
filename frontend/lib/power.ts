/**
 * Power to detect a proportional decrease in TN or TP at a monitored site.
 *
 * The heavy work already happened offline: for every site, sampling frequency and
 * duration, `slope_se_per_year` holds the GLS standard error of the annual log-scale
 * trend. Given that one number, power for ANY reduction is two lines of arithmetic,
 * which is why the reduction is a slider rather than a stored column.
 *
 * One-sided test, H0: slope = 0 against HA: slope < 0, alpha = 0.05.
 * See WEBSITE_IMPLEMENTATION.md.
 */

export const ALPHA = 0.05;
export const TARGET_POWER = 0.8;
export const Z_ONE_SIDED_0_05 = 1.6448536269514722;

/** Abramowitz & Stegun 26.2.17 — max error 7.5e-8, verified against scipy at 6.97e-08. */
export function normalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

/** Inverse normal CDF (Acklam's rational approximation). Needed for the target-power line. */
export function normalQuantile(p: number): number {
  const a = [-39.696830286653757, 220.9460984245205, -275.92851044696869,
    138.357751867269, -30.66479806614716, 2.5066282774592392];
  const b = [-54.476098798224058, 161.58583685804089, -155.69897985988661,
    66.80131188771972, -13.280681552885721];
  const c = [-0.0077848940024302926, -0.32239645804113648, -2.4007582771618381,
    -2.5497325393437338, 4.3746641414649678, 2.9381639826987831];
  const d = [0.0077846957090414622, 0.32246712907003983, 2.445134137142996,
    3.7544086619074162];
  const pLow = 0.02425;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pLow) return -normalQuantile(1 - p);

  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * The true annual log-scale slope of a decline that reaches `reductionPct` at the
 * end of `years`. Sign dropped — the test already knows it is looking downwards.
 */
export function slopeForReduction(reductionPct: number, years: number): number {
  return Math.abs(Math.log1p(-reductionPct / 100) / years);
}

/** Power as a fraction 0-1. Returns 0 rather than throwing for an out-of-range slider. */
export function powerForReduction(
  reductionPct: number,
  years: number,
  slopeSe: number,
): number {
  if (!(reductionPct > 0 && reductionPct < 100)) return 0;
  if (!(years > 0) || !(slopeSe > 0)) return 0;
  const power = normalCdf(slopeForReduction(reductionPct, years) / slopeSe - Z_ONE_SIDED_0_05);
  return Math.min(1, Math.max(0, power));
}

/**
 * Smallest reduction (%) this design could detect at `targetPower`.
 * Inverts the line above: slope = (z_alpha + z_power) * SE, then back to a percentage.
 */
export function minDetectableReduction(
  slopeSe: number,
  years: number,
  targetPower: number = TARGET_POWER,
): number {
  if (!(slopeSe > 0) || !(years > 0)) return 100;
  const slope = (Z_ONE_SIDED_0_05 + normalQuantile(targetPower)) * slopeSe;
  return Math.min(100, (1 - Math.exp(-slope * years)) * 100);
}

// --- monitoring design ------------------------------------------------------

export interface FrequencyOption {
  key: string;
  label: string;
  samplesPerYear: number;
  /** Below the interval the historical CAR(1) was fitted at, so flag the result. */
  extrapolated: boolean;
}

/** Values are the manifest's, not rounded — samplesPerYear feeds the SE calculation. */
export const FREQUENCIES: FrequencyOption[] = [
  { key: "quarterly", label: "Quarterly", samplesPerYear: 4, extrapolated: false },
  { key: "monthly", label: "Monthly", samplesPerYear: 12, extrapolated: false },
  { key: "fortnightly", label: "Fortnightly", samplesPerYear: 26.08875, extrapolated: false },
  { key: "weekly", label: "Weekly", samplesPerYear: 52.1775, extrapolated: true },
  { key: "daily", label: "Daily", samplesPerYear: 365.2425, extrapolated: true },
];

export const DURATIONS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

export function frequencyOption(key: string): FrequencyOption {
  return FREQUENCIES.find((f) => f.key === key) ?? FREQUENCIES[1];
}

/** Nominal, assuming no missed visits — the same rounding the lookup was built with. */
export function plannedSampleCount(years: number, samplesPerYear: number): number {
  return Math.round(years * samplesPerYear);
}

// --- colour scale -----------------------------------------------------------

export const POWER_BREAKS = [0.2, 0.4, 0.6, 0.8];

export const POWER_COLOURS = ["#e2e8f0", "#bfdbfe", "#60a5fa", "#2563eb", "#1e3a8a"];

export const POWER_LEGEND = [
  { label: "< 0.20", colour: POWER_COLOURS[0] },
  { label: "0.20+", colour: POWER_COLOURS[1] },
  { label: "0.40+", colour: POWER_COLOURS[2] },
  { label: "0.60+", colour: POWER_COLOURS[3] },
  { label: "0.80+", colour: POWER_COLOURS[4] },
];

/** `power` is a fraction 0-1. */
export function powerColour(power: number): string {
  for (let i = 0; i < POWER_BREAKS.length; i++) {
    if (power < POWER_BREAKS[i]) return POWER_COLOURS[i];
  }
  return POWER_COLOURS[POWER_COLOURS.length - 1];
}

export function formatPower(power: number): string {
  return power.toFixed(2);
}
