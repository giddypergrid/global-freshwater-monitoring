"use client";

import CatchmentPicker from "./CatchmentPicker";
import QueryControls from "./QueryControls";
import ResultsSummary from "./ResultsSummary";
import DownloadBlock from "./DownloadBlock";
import type { SiteResult } from "@/lib/summary";
import type { CatchmentSummary, DataIndex, Query } from "@/lib/types";

interface Props {
  index: DataIndex;
  region: string;
  selectedId: string | null;
  catchment: CatchmentSummary | null;
  query: Query;
  results: SiteResult[];
  selected: SiteResult | null;
  loading: boolean;
  showSites: boolean;
  onRegionChange: (region: string) => void;
  onSelectCatchment: (id: string) => void;
  onQueryChange: (query: Query) => void;
  onToggleSites: (show: boolean) => void;
  onClearSite: () => void;
}

/** Counts follow the drill-down: the open catchment, else the region, else everything. */
function scopeCounts(index: DataIndex, region: string, catchment: CatchmentSummary | null) {
  if (catchment) {
    return { counts: { tn: catchment.tn, tp: catchment.tp }, label: `catchment ${catchment.id}` };
  }
  if (region) {
    const rows = index.catchments.filter((c) => c.region === region);
    return {
      counts: {
        tn: rows.reduce((sum, c) => sum + c.tn, 0),
        tp: rows.reduce((sum, c) => sum + c.tp, 0),
      },
      label: region,
    };
  }
  const [tn, tp] = index.nutrients;
  return { counts: { tn: tn.sites, tp: tp.sites }, label: "all regions" };
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
      {children}
    </h2>
  );
}

export default function ControlPanel({
  index,
  region,
  selectedId,
  catchment,
  query,
  results,
  selected,
  loading,
  showSites,
  onRegionChange,
  onSelectCatchment,
  onQueryChange,
  onToggleSites,
  onClearSite,
}: Props) {
  const { counts, label: scopeLabel } = scopeCounts(index, region, catchment);

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-white">
      <div className="space-y-6 p-4">
        <div>
          <SectionHeading>Location</SectionHeading>
          <CatchmentPicker
            regions={index.regions}
            catchments={index.catchments}
            region={region}
            nutrient={query.nutrient}
            selectedId={selectedId}
            onRegionChange={onRegionChange}
            onSelect={onSelectCatchment}
          />
        </div>

        <div className="border-t border-slate-200 pt-5">
          <SectionHeading>Monitoring design</SectionHeading>
          <QueryControls
            index={index}
            query={query}
            counts={counts}
            scopeLabel={scopeLabel}
            onChange={onQueryChange}
          />
          <label className="mt-4 flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={showSites}
              onChange={(e) => onToggleSites(e.target.checked)}
              className="size-3.5 rounded border-slate-300 accent-slate-800"
            />
            Show monitoring sites
          </label>
        </div>

        <div className="border-t border-slate-200 pt-5">
          <SectionHeading>{selected ? "Site result" : "Catchment result"}</SectionHeading>
          {loading && <p className="text-sm text-slate-500">Loading power lookup…</p>}
          {!loading && (
            <ResultsSummary
              index={index}
              catchment={catchment}
              query={query}
              results={results}
              selected={selected}
              onClearSite={onClearSite}
            />
          )}
        </div>

        <DownloadBlock
          results={results}
          query={query}
          scope={selectedId ?? "catchment"}
        />

        <p className="text-[11px] leading-[1.7] text-slate-600">
          One-sided test of a negative trend, alpha {index.alpha}. Power is a
          monitoring-design calculation, not a prediction that the reduction will occur.
          Data generated {index.generated} from {index.totals.records.toLocaleString()}{" "}
          site–nutrient records across {index.totals.catchments.toLocaleString()}{" "}
          catchments.
        </p>
      </div>
    </div>
  );
}
