/**
 * Emits the browser's own normalCdf and powerForReduction over a grid, as JSON on stdout.
 * scripts/acceptance.py compares these against scipy. Keeping the values from the real
 * module means the test checks shipped code, not a copy of it.
 */
import { normalCdf, powerForReduction, slopeForReduction } from "../lib/power.ts";

const zs = [];
for (let z = -6; z <= 6; z += 0.01) zs.push(Math.round(z * 100) / 100);

const cdf = zs.map((z) => [z, normalCdf(z)]);

// A spread of real designs: SE values seen in the data, every duration, 5% to 95%.
const power = [];
for (const se of [0.0009208, 0.004634, 0.01944, 0.05566, 0.2, 0.937045]) {
  for (const years of [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]) {
    for (const pct of [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95]) {
      power.push([se, years, pct, slopeForReduction(pct, years), powerForReduction(pct, years, se)]);
    }
  }
}

// Input validation: these must all return 0 rather than a number that looks like power.
const rejected = [0, -5, 100, 120, NaN].map((pct) => [pct, powerForReduction(pct, 20, 0.004634)]);

process.stdout.write(JSON.stringify({ cdf, power, rejected }));
