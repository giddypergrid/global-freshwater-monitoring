/**
 * Catchment-level roll-up.
 *
 * These are summaries of SITE-SPECIFIC results, the share of a catchment's monitored
 * sites that individually reach the target. They are NOT the power of a pooled
 * catchment-wide trend test, which would need a multilevel model that represents how
 * sites on the same river depend on each other. Label them accordingly in the UI.
 */

import {
  TARGET_POWER,
  frequencyOption,
  minDetectableReduction,
  plannedSampleCount,
  powerForReduction,
} from "./power";
import { slopeSe } from "./data";
import type {
  CatchmentSummary,
  NutrientKey,
  PowerSlice,
  Query,
  Site,
} from "./types";

/**
 * How many sites a catchment holds for the nutrient currently on screen.
 *
 * `records` on a catchment is total nitrogen and total phosphorus added together, so it
 * overstates what the map can draw whenever one of the two is empty. Catchment 2060497340
 * carries `records` 184, all of it phosphorus and none of it nitrogen: labelling it "184
 * site records" while total nitrogen is selected promised 184 dots and drew none.
 */
export function siteCountFor(
  catchment: CatchmentSummary,
  nutrient: NutrientKey,
): number {
  return nutrient === "tn" ? catchment.tn : catchment.tp;
}

export interface SiteResult {
  site: Site;
  slopeSe: number;
  power: number;
  minDetectable: number;
}

export interface CatchmentStats {
  count: number;
  atTarget: number;
  shareAtTarget: number;
  medianPower: number;
  medianMinDetectable: number;
  tierA: number;
  tierB: number;
  aboveThreshold: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Sites with no row in the slice are dropped rather than shown as zero power. */
export function resolveSites(
  sites: Site[],
  slice: PowerSlice | null,
  query: Query,
): SiteResult[] {
  if (!slice) return [];
  const results: SiteResult[] = [];
  for (const site of sites) {
    const se = slopeSe(slice, site.id, query.years);
    if (se === null) continue;
    results.push({
      site,
      slopeSe: se,
      power: powerForReduction(query.reduction, query.years, se),
      minDetectable: minDetectableReduction(se, query.years),
    });
  }
  return results;
}

export function summarise(results: SiteResult[]): CatchmentStats {
  const atTarget = results.filter((r) => r.power >= TARGET_POWER).length;
  return {
    count: results.length,
    atTarget,
    shareAtTarget: results.length ? atTarget / results.length : 0,
    medianPower: median(results.map((r) => r.power)),
    medianMinDetectable: median(results.map((r) => r.minDetectable)),
    tierA: results.filter((r) => r.site.tier === "A_robust").length,
    tierB: results.filter((r) => r.site.tier === "B_moderate").length,
    aboveThreshold: results.filter((r) => r.site.aboveThreshold).length,
  };
}

/** Flat per-site export. The query is repeated on every row so the file stands alone. */
export function buildCsv(results: SiteResult[], query: Query): string {
  const frequency = frequencyOption(query.frequency);
  const samples = plannedSampleCount(query.years, frequency.samplesPerYear);

  const header = [
    "site_parameter_id",
    "site_id",
    "parameter",
    "latitude",
    "longitude",
    "hybas_id",
    "power_readiness_tier",
    "current_modelled_annual_median_mg_L",
    "threshold_mg_L",
    "above_threshold",
    "frequency",
    "samples_per_year",
    "duration_years",
    "planned_sample_count",
    "slope_se_per_year",
    "reduction_percent",
    "power_one_sided_alpha_0_05",
    "reaches_target_power",
    "min_detectable_reduction_percent",
  ].join(",");

  const rows = results.map((r) =>
    [
      r.site.id,
      r.site.siteId,
      r.site.parameter,
      r.site.lat,
      r.site.lon,
      r.site.hybasId ?? "",
      r.site.tier,
      r.site.current,
      r.site.threshold,
      r.site.aboveThreshold,
      query.frequency,
      frequency.samplesPerYear,
      query.years,
      samples,
      r.slopeSe,
      query.reduction,
      r.power.toFixed(4),
      r.power >= TARGET_POWER,
      r.minDetectable.toFixed(1),
    ].join(","),
  );

  return [header, ...rows].join("\n");
}

export function csvFilename(scope: string, query: Query): string {
  return `${scope}_${query.nutrient}_${query.frequency}_${query.years}y_${query.reduction}pct.csv`;
}
