"use client";

import { detectionPower, minDetectableReduction, powerColour } from "@/lib/power";
import { summarise, TARGET_POWER } from "@/lib/summary";
import type { CatchmentDetail, Query, Selection } from "@/lib/types";

interface Props {
  detail: CatchmentDetail;
  query: Query;
  selection: Selection | null;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900 tabular-nums">{value}</span>
    </div>
  );
}

export default function ResultsSummary({ detail, query, selection }: Props) {
  const stats = summarise(detail, query);
  const reachPct = stats.reachCount
    ? Math.round((stats.reachesAtTarget / stats.reachCount) * 100)
    : 0;

  const selectedCv = selection?.props.cv[query.indicator];
  const selectedPower =
    selectedCv === undefined
      ? null
      : detectionPower(selectedCv, query.reduction, query.years, query.samplesPerYear);
  const selectedMin =
    selectedCv === undefined
      ? null
      : minDetectableReduction(selectedCv, query.years, query.samplesPerYear, TARGET_POWER);

  return (
    <section className="space-y-3">
      <div className="divide-y divide-slate-100">
        <Row label="Median power across reaches" value={`${stats.medianPower.toFixed(0)}%`} />
        <Row
          label={`Reaches at ${TARGET_POWER}% power`}
          value={`${stats.reachesAtTarget.toLocaleString()} of ${stats.reachCount.toLocaleString()} (${reachPct}%)`}
        />
        <Row
          label={`Monitoring sites at ${TARGET_POWER}% power`}
          value={`${stats.sitesAtTarget} of ${stats.siteCount}`}
        />
        <Row
          label="Median detectable improvement"
          value={`${stats.medianMinDetectable.toFixed(0)}%`}
        />
      </div>

      {selection && selectedPower !== null && selectedMin !== null && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium tracking-wide text-slate-500 uppercase">
              {selection.kind === "site" ? "Monitoring site" : "River reach"}
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums"
              style={{ backgroundColor: powerColour(selectedPower) }}
            >
              {selectedPower.toFixed(0)}%
            </span>
          </div>
          <div className="space-y-0.5 text-xs text-slate-600">
            <div className="font-medium text-slate-900">
              {selection.kind === "site" ? selection.props.name : `Reach ${selection.props.id}`}
            </div>
            <div>Stream order {selection.props.ord}</div>
            <div className="tabular-nums">
              Needs a {selectedMin.toFixed(0)}% improvement to reach {TARGET_POWER}% power
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
