"use client";

import { X } from "lucide-react";
import {
  TARGET_POWER,
  formatPower,
  frequencyOption,
  plannedSampleCount,
  powerColour,
} from "@/lib/power";
import { summarise } from "@/lib/summary";
import type { SiteResult } from "@/lib/summary";
import type { CatchmentSummary, DataIndex, Query } from "@/lib/types";

interface Props {
  index: DataIndex;
  catchment: CatchmentSummary | null;
  query: Query;
  results: SiteResult[];
  selected: SiteResult | null;
  onClearSite: () => void;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-slate-500">{label}</span>
      <span
        className={`text-right text-sm font-medium text-slate-900 ${mono ? "tabular-nums" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function PowerHeadline({ power }: { power: number }) {
  const reached = power >= TARGET_POWER;
  return (
    <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <span
        className="size-9 shrink-0 rounded"
        style={{ backgroundColor: powerColour(power) }}
      />
      <div className="min-w-0">
        <div className="text-2xl leading-none font-semibold text-slate-900 tabular-nums">
          {formatPower(power)}
        </div>
        <div className={`mt-1 text-xs ${reached ? "text-emerald-700" : "text-amber-700"}`}>
          {reached ? "At or above the 0.80 target" : "Below the 0.80 target"}
        </div>
      </div>
    </div>
  );
}

/** Site detail when one is picked; otherwise the catchment roll-up. */
export default function ResultsSummary({
  index,
  catchment,
  query,
  results,
  selected,
  onClearSite,
}: Props) {
  const frequency = frequencyOption(query.frequency);
  const samples = plannedSampleCount(query.years, frequency.samplesPerYear);

  if (selected) {
    const { site } = selected;
    return (
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-mono text-sm font-medium text-slate-900">
              {site.id}
            </div>
            <div className="text-[11px] text-slate-500">
              {site.region} · {site.lat.toFixed(4)}, {site.lon.toFixed(4)} · EPSG:4326
            </div>
          </div>
          <button
            type="button"
            onClick={onClearSite}
            className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Clear selected site"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <PowerHeadline power={selected.power} />

        <div className="divide-y divide-slate-100">
          <Row
            label={index.concentrationLabel}
            value={`${site.current.toPrecision(3)} mg/L`}
            mono
          />
          <Row
            label="Threshold"
            value={`${site.threshold} mg/L, ${site.aboveThreshold ? "above" : "below"}`}
            mono
          />
          <Row label="Power readiness tier" value={site.tierLabel} />
          <Row label="Positive unique dates" value={site.sampledDates.toLocaleString()} mono />
          <Row label="Modelled record" value={`${site.modelFirst} → ${site.modelLast}`} mono />
          {(site.metaFirst !== site.modelFirst || site.metaLast !== site.modelLast) && (
            <Row label="Raw record" value={`${site.metaFirst} → ${site.metaLast}`} mono />
          )}
        </div>

        <div className="rounded-md border border-slate-200 p-3">
          <div className="mb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
            This design
          </div>
          <div className="divide-y divide-slate-100">
            <Row
              label="Design"
              value={`${frequency.label}, ${query.years} yr, ${query.reduction}% reduction`}
            />
            <Row label="Planned samples" value={samples.toLocaleString()} mono />
            <Row label="slope_se_per_year" value={selected.slopeSe.toPrecision(4)} mono />
            <Row
              label="Smallest detectable reduction"
              value={`${selected.minDetectable.toFixed(1)}%`}
              mono
            />
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          <Row label="Catchment" value={site.hybasId ?? "None, outside coverage"} mono />
          {site.basinMethod !== "point_in_polygon" && (
            <Row
              label="Basin assignment"
              value={
                site.basinMethod === "nearest_polygon_within_5km"
                  ? `Nearest polygon, ${site.basinDistanceKm} km`
                  : `Outside coverage, ${site.basinDistanceKm.toFixed(0)} km to nearest`
              }
            />
          )}
        </div>

        {frequency.extrapolated && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-800">
            {frequency.label} sampling extrapolates the fitted temporal correlation below
            the dominant observed interval. Storm-event and diurnal variability are not
            represented. Treat this as a conditional model-based projection.
          </p>
        )}
      </section>
    );
  }

  if (!catchment) {
    return (
      <p className="text-sm text-slate-500">
        Select a catchment from the list or click one on the map. Click a site for its
        own result.
      </p>
    );
  }

  const stats = summarise(results);
  const median = catchment[query.nutrient === "tn" ? "medianTn" : "medianTp"];

  return (
    <section className="space-y-3">
      <div>
        <div className="font-mono text-sm font-medium text-slate-900">{catchment.id}</div>
        <div className="text-[11px] text-slate-500">
          HydroBASINS level 6 · {catchment.region} · {catchment.hydroRegion}
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        <Row
          label={`${query.nutrient.toUpperCase()} site records here`}
          value={stats.count.toLocaleString()}
          mono
        />
        <Row
          label="Reaching power 0.80"
          value={`${stats.atTarget} of ${stats.count} (${Math.round(stats.shareAtTarget * 100)}%)`}
          mono
        />
        <Row label="Median power" value={formatPower(stats.medianPower)} mono />
        <Row
          label="Median smallest detectable reduction"
          value={`${stats.medianMinDetectable.toFixed(1)}%`}
          mono
        />
        <Row label="Tier A / Tier B" value={`${stats.tierA} / ${stats.tierB}`} mono />
        <Row
          label="Above threshold"
          value={`${stats.aboveThreshold} of ${stats.count}`}
          mono
        />
        <Row
          label="Median current concentration"
          value={median === null ? "no site of this nutrient" : `${median.toPrecision(3)} mg/L`}
          mono
        />
      </div>

      <p className="rounded-md border border-slate-200 bg-slate-50 p-2.5 text-[11px] leading-relaxed text-slate-700">
        A distribution of <strong>site-specific</strong> results, not the power of a
        pooled catchment-wide trend test. A pooled test needs a model of how sites on the
        same river depend on each other, which is outside this implementation.
      </p>

      <div className="rounded-md border border-slate-200 p-3">
        <div className="mb-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
          Catchment
        </div>
        <div className="divide-y divide-slate-100">
          <Row label="Own area" value={`${catchment.subArea.toLocaleString()} km²`} mono />
          <Row
            label="Area incl. upstream"
            value={`${catchment.upArea.toLocaleString()} km²`}
            mono
          />
          <Row
            label="Drains into"
            value={catchment.nextDown === "0" ? "Sea or inland sink" : catchment.nextDown}
            mono
          />
          <Row label="River system" value={catchment.mainBas} mono />
          <Row label="Pfafstetter" value={catchment.pfaf} mono />
          <Row label="River order" value={String(catchment.order)} mono />
          {catchment.coast === 1 && <Row label="Coastal" value="Drains to the coast" />}
          {catchment.endo !== 0 && <Row label="Endorheic" value="Never reaches the ocean" />}
          <Row
            label="All records here"
            value={`${catchment.records} (${catchment.tn} TN / ${catchment.tp} TP)`}
            mono
          />
        </div>
      </div>
    </section>
  );
}
