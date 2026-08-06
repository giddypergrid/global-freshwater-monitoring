"use client";

import CatchmentPicker from "./CatchmentPicker";
import QueryControls from "./QueryControls";
import ResultsSummary from "./ResultsSummary";
import DownloadBlock from "./DownloadBlock";
import type { CatchmentDetail, DataIndex, Query, Selection } from "@/lib/types";

interface Props {
  index: DataIndex;
  country: string;
  selectedId: string | null;
  detail: CatchmentDetail | null;
  query: Query;
  selection: Selection | null;
  loading: boolean;
  showSites: boolean;
  onCountryChange: (country: string) => void;
  onSelectCatchment: (id: string) => void;
  onQueryChange: (query: Query) => void;
  onToggleSites: (show: boolean) => void;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
      {children}
    </h2>
  );
}

export default function ControlPanel({
  index,
  country,
  selectedId,
  detail,
  query,
  selection,
  loading,
  showSites,
  onCountryChange,
  onSelectCatchment,
  onQueryChange,
  onToggleSites,
}: Props) {
  const indicatorLabel =
    index.indicators.find((i) => i.key === query.indicator)?.label ?? query.indicator;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-white">
      <div className="space-y-6 p-4">
        <div>
          <SectionHeading>Location</SectionHeading>
          <CatchmentPicker
            countries={index.countries}
            catchments={index.catchments}
            country={country}
            selectedId={selectedId}
            onCountryChange={onCountryChange}
            onSelect={onSelectCatchment}
          />
        </div>

        <div className="border-t border-slate-200 pt-5">
          <SectionHeading>Monitoring scenario</SectionHeading>
          <QueryControls
            indicators={index.indicators}
            query={query}
            onChange={onQueryChange}
          />
          <label className="mt-4 flex items-center gap-2 text-xs text-slate-600">
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
          <SectionHeading>Results</SectionHeading>
          {loading && <p className="text-sm text-slate-400">Loading catchment…</p>}
          {!loading && !detail && (
            <p className="text-sm text-slate-400">
              Select a catchment from the list or click one on the map.
            </p>
          )}
          {!loading && detail && (
            <ResultsSummary detail={detail} query={query} selection={selection} />
          )}
        </div>

        <DownloadBlock detail={detail} query={query} indicatorLabel={indicatorLabel} />
      </div>
    </div>
  );
}
