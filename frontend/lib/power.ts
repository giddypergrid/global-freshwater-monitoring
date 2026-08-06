/**
 * Detection power for a step change in a monitored water-quality series.
 *
 * A site is sampled at a fixed frequency for a number of years, and the record is
 * split into a "before" and "after" half. The question the tool answers is: if the
 * true concentration dropped by X%, how often would that monitoring record actually
 * show a statistically significant drop?
 *
 * Standard two-sample comparison of means. With n samples split evenly, the
 * standard error of the difference is 2*CV/sqrt(n), so
 *
 *     power = P( reduction / SE  >  z(1-alpha/2) )
 *
 * The real NZ tool derives its curves from Monte Carlo simulation offline and ships
 * the results in the data files. This runs the closed-form equivalent in the browser
 * from a per-reach coefficient of variation, which is what keeps the app backend-free.
 */

const Z_ALPHA = 1.959963985; // two-sided 5% significance

/** Abramowitz & Stegun 26.2.17 — max error 7.5e-8. */
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

/** Inverse normal CDF (Acklam's rational approximation). */
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

/** Standard error of the before/after difference, as a fraction of the mean. */
function standardError(cv: number, years: number, samplesPerYear: number): number {
  const n = years * samplesPerYear;
  return (2 * cv) / Math.sqrt(n);
}

/** Probability of detecting `reductionPct` (0-100), as a percentage 0-100. */
export function detectionPower(
  cv: number,
  reductionPct: number,
  years: number,
  samplesPerYear: number,
): number {
  if (reductionPct <= 0) return 0;
  const se = standardError(cv, years, samplesPerYear);
  return normalCdf(reductionPct / 100 / se - Z_ALPHA) * 100;
}

/** Smallest reduction (%) detectable at `targetPower` (0-100), capped at 100. */
export function minDetectableReduction(
  cv: number,
  years: number,
  samplesPerYear: number,
  targetPower: number,
): number {
  const se = standardError(cv, years, samplesPerYear);
  const value = (Z_ALPHA + normalQuantile(targetPower / 100)) * se * 100;
  return Math.min(value, 100);
}

// --- colour scale -----------------------------------------------------------

export const POWER_BREAKS = [20, 40, 60, 80];

export const POWER_COLOURS = ["#e2e8f0", "#bfdbfe", "#60a5fa", "#2563eb", "#1e3a8a"];

export const POWER_LEGEND = [
  { label: "0%+", colour: POWER_COLOURS[0] },
  { label: "20%+", colour: POWER_COLOURS[1] },
  { label: "40%+", colour: POWER_COLOURS[2] },
  { label: "60%+", colour: POWER_COLOURS[3] },
  { label: "80%+", colour: POWER_COLOURS[4] },
];

export function powerColour(power: number): string {
  for (let i = 0; i < POWER_BREAKS.length; i++) {
    if (power < POWER_BREAKS[i]) return POWER_COLOURS[i];
  }
  return POWER_COLOURS[POWER_COLOURS.length - 1];
}

// --- sampling options -------------------------------------------------------

export const SAMPLING_YEARS = [5, 10, 20, 30];

export const SAMPLING_FREQUENCIES = [
  { value: 4, label: "Quarterly" },
  { value: 12, label: "Monthly" },
  { value: 26, label: "Fortnightly" },
  { value: 52, label: "Weekly" },
];

export function frequencyLabel(samplesPerYear: number): string {
  return SAMPLING_FREQUENCIES.find((f) => f.value === samplesPerYear)?.label ?? `${samplesPerYear}/yr`;
}
