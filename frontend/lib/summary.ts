import { detectionPower, frequencyLabel, minDetectableReduction } from "./power";
import type { CatchmentDetail, Query } from "./types";

/** Conventional target: an 80% chance of detecting the change. */
export const TARGET_POWER = 80;

export interface PowerSummary {
  reachCount: number;
  siteCount: number;
  medianPower: number;
  reachesAtTarget: number;
  sitesAtTarget: number;
  medianMinDetectable: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function summarise(detail: CatchmentDetail, query: Query): PowerSummary {
  const { indicator, reduction, years, samplesPerYear } = query;

  const reachPowers = detail.reaches.features.map((f) =>
    detectionPower(f.properties.cv[indicator], reduction, years, samplesPerYear),
  );
  const sitePowers = detail.sites.features.map((f) =>
    detectionPower(f.properties.cv[indicator], reduction, years, samplesPerYear),
  );
  const minDetectable = detail.reaches.features.map((f) =>
    minDetectableReduction(f.properties.cv[indicator], years, samplesPerYear, TARGET_POWER),
  );

  return {
    reachCount: reachPowers.length,
    siteCount: sitePowers.length,
    medianPower: median(reachPowers),
    reachesAtTarget: reachPowers.filter((p) => p >= TARGET_POWER).length,
    sitesAtTarget: sitePowers.filter((p) => p >= TARGET_POWER).length,
    medianMinDetectable: median(minDetectable),
  };
}

/** Flat per-reach export, with the query repeated so the file stands on its own. */
export function buildCsv(detail: CatchmentDetail, query: Query, indicatorLabel: string): string {
  const { indicator, reduction, years, samplesPerYear } = query;

  const header = [
    "catchment",
    "country",
    "reach_id",
    "stream_order",
    "length_km",
    "indicator",
    "reduction_pct",
    "years",
    "samples_per_year",
    "coefficient_of_variation",
    "detection_power_pct",
    "min_detectable_reduction_pct",
  ].join(",");

  const rows = detail.reaches.features.map((f) => {
    const p = f.properties;
    const cv = p.cv[indicator];
    return [
      detail.name,
      detail.country,
      p.id,
      p.ord,
      p.len,
      indicatorLabel,
      reduction,
      years,
      samplesPerYear,
      cv.toFixed(3),
      detectionPower(cv, reduction, years, samplesPerYear).toFixed(1),
      minDetectableReduction(cv, years, samplesPerYear, TARGET_POWER).toFixed(1),
    ].join(",");
  });

  return [header, ...rows].join("\n");
}

export function csvFilename(detail: CatchmentDetail, query: Query): string {
  return `${detail.id}_${query.indicator}_${query.years}y_${frequencyLabel(
    query.samplesPerYear,
  ).toLowerCase()}.csv`;
}
