"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import ControlPanel from "./panel/ControlPanel";
import { loadIndex, loadOutlines, loadPower, loadSites } from "@/lib/data";
import { resolveSites } from "@/lib/summary";
import type {
  CatchmentOutlines,
  DataIndex,

  PowerSlice,
  Query,
  Site,
} from "@/lib/types";

/** Leaflet touches `window` on import, so the map only ever renders in the browser. */
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-slate-100 text-sm text-slate-500">
      Loading map…
    </div>
  ),
});

const DEFAULT_QUERY: Query = {
  nutrient: "tn",
  frequency: "monthly",
  years: 20,
  reduction: 30,
};

const WORLD: [number, number, number, number] = [-170, -50, 180, 72];

export default function ToolShell() {
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [outlines, setOutlines] = useState<CatchmentOutlines | null>(null);
  const [region, setRegion] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState<Query>(DEFAULT_QUERY);
  const [sites, setSites] = useState<Site[] | null>(null);
  const [power, setPower] = useState<PowerSlice | null>(null);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(WORLD);
  const [loading, setLoading] = useState(false);
  const [showSites, setShowSites] = useState(true);

  useEffect(() => {
    loadIndex().then((data) => {
      const params = new URLSearchParams(window.location.search);
      const fromUrl = data.catchments.find((c) => c.id === params.get("catchment"));
      const named = data.regions.find((r) => r.name === params.get("region"));
      const nutrient = params.get("nutrient");

      setIndex(data);
      // No region is chosen up front. The user free-roams the world map until they click.
      setRegion(fromUrl?.region ?? named?.name ?? "");
      if (nutrient === "tn" || nutrient === "tp") {
        setQuery((q) => ({ ...q, nutrient }));
      }
      if (fromUrl) {
        setSelectedId(fromUrl.id);
        setBbox(fromUrl.bbox);
      } else if (named) {
        setBbox(named.bbox);
      }
    });
    // The outline layer is 2 MB, so it never blocks the first paint.
    loadOutlines().then(setOutlines);
  }, []);

  // The site list and the power slice are independent fetches; both are cached per key.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [nextSites, nextPower] = await Promise.all([
          loadSites(query.nutrient),
          loadPower(query.nutrient, query.frequency),
        ]);
        if (cancelled) return;
        setSites(nextSites);
        setPower(nextPower);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [query.nutrient, query.frequency]);

  useEffect(() => {
    // The write happens only after the index has been read, or this replaceState wipes
    // the ?catchment= it is about to be restored from.
    if (!index) return;
    const params = new URLSearchParams({ nutrient: query.nutrient });
    if (region) params.set("region", region);
    if (selectedId) params.set("catchment", selectedId);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [index, region, selectedId, query.nutrient]);

  const catchment = useMemo(
    () => index?.catchments.find((c) => c.id === selectedId) ?? null,
    [index, selectedId],
  );

  /** Every site of the current nutrient, with its SE and power resolved. */
  const allResults = useMemo(
    () => (sites ? resolveSites(sites, power, query) : []),
    [sites, power, query],
  );

  const catchmentResults = useMemo(
    () => (selectedId ? allResults.filter((r) => r.site.hybasId === selectedId) : []),
    [allResults, selectedId],
  );

  const selectedResult = useMemo(
    () => allResults.find((r) => r.site.id === selectedSiteId) ?? null,
    [allResults, selectedSiteId],
  );

  const handleRegionChange = useCallback(
    (name: string) => {
      setRegion(name);
      setSelectedId(null);
      setSelectedSiteId(null);
      setBbox(index?.regions.find((r) => r.name === name)?.bbox ?? WORLD);
    },
    [index],
  );

  /**
   * The drill-down is strict: region, then catchment, then site. Picking a catchment that
   * belongs elsewhere resets to that region with a cleared selection, rather than opening a
   * catchment the picker is not listing.
   */
  const handleSelectCatchment = useCallback(
    (id: string) => {
      const picked = index?.catchments.find((c) => c.id === id);
      if (!picked) return;
      // Reaching outside the active region means the user is changing region, not opening
      // a catchment the picker is not listing. With no region set yet, anything is fair game.
      if (region && picked.region !== region) {
        handleRegionChange(picked.region);
        return;
      }
      if (!region) setRegion(picked.region);
      if (picked.bbox) setBbox(picked.bbox);
      setSelectedId(id);
      setSelectedSiteId(null);
    },
    [index, region, handleRegionChange],
  );

  // Only sites inside the open catchment are clickable, so this never changes the region.
  const handleSelectSite = useCallback((id: string | null) => setSelectedSiteId(id), []);

  const handleQueryChange = useCallback((next: Query) => setQuery(next), []);
  const handleToggleSites = useCallback((show: boolean) => setShowSites(show), []);

  return (
    // Side-by-side from 768px up. At 900px stacking would cut the panel mid-control
    // for no reason. Only genuinely narrow screens stack.
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      {/* ControlPanel owns the scrolling, so no overflow here or you get two scrollbars. */}
      <aside className="max-h-[45%] w-full shrink-0 border-b border-slate-200 md:max-h-none md:w-[340px] md:border-r md:border-b-0 lg:w-[380px]">
        {index ? (
          <ControlPanel
            index={index}
            region={region}
            selectedId={selectedId}
            catchment={catchment}
            query={query}
            results={catchmentResults}
            selected={selectedResult}
            loading={loading}
            showSites={showSites}
            onRegionChange={handleRegionChange}
            onSelectCatchment={handleSelectCatchment}
            onQueryChange={handleQueryChange}
            onToggleSites={handleToggleSites}
            onClearSite={() => setSelectedSiteId(null)}
          />
        ) : (
          <div className="p-4 text-sm text-slate-500">Loading…</div>
        )}
      </aside>

      <main className="min-h-[320px] min-w-0 flex-1">
        <MapView
          outlines={outlines}
          index={index}
          region={region}
          selectedId={selectedId}
          results={allResults}
          selectedSiteId={selectedSiteId}
          bbox={bbox}
          showSites={showSites}
          loading={loading}
          onSelectCatchment={handleSelectCatchment}
          onSelectSite={handleSelectSite}
          onJumpRegion={handleRegionChange}
        />
      </main>
    </div>
  );
}
