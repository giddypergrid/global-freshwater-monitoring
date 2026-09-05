"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import ControlPanel from "./panel/ControlPanel";
import { loadIndex, loadOutlines, loadPower, loadSites } from "@/lib/data";
import { resolveSites } from "@/lib/summary";
import { withinBounds } from "@/lib/geo";
import type {
  CatchmentOutlines,
  DataIndex,

  PowerSlice,
  Query,
  Site,
} from "@/lib/types";
import type { LatLngBounds } from "leaflet";

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
  const [viewBounds, setViewBounds] = useState<LatLngBounds | null>(null);

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

  /**
   * The open catchment, resolved on its own. It is the panel's and the CSV's source, so it
   * has to stay complete no matter where the map has been panned to.
   */
  const catchmentResults = useMemo(() => {
    if (!sites || !selectedId) return [];
    return resolveSites(
      sites.filter((s) => s.hybasId === selectedId),
      power,
      query,
    );
  }, [sites, power, query, selectedId]);

  /**
   * The background sites, resolved only where the map is actually looking.
   *
   * Until 4 Sep 2026 this resolved every site of the nutrient on every query change, all
   * 11,224 of them for total phosphorus, and the map then threw most of the answer away
   * when it drew. Mike Kittridge asked on 3 Sep how that would scale. Measured on the live
   * site, the whole-file pass costs 1.5 to 2.0 ms at today's 11,224 sites and 24 to 38 ms
   * at 101,016, which is past the 16.7 ms a 60 frames-per-second budget allows, and the
   * reduction slider fires it on every drag step. Scoped to the viewport it costs 1.4 to
   * 7.2 ms for the widest European view and does not grow with the file.
   */
  const viewportResults = useMemo(() => {
    if (!sites) return [];
    if (!viewBounds) return resolveSites(sites, power, query);
    const isInView = withinBounds(viewBounds);
    return resolveSites(
      sites.filter((s) => isInView(s.lat, s.lon)),
      power,
      query,
    );
  }, [sites, power, query, viewBounds]);

  /**
   * The map needs the open catchment drawn whether or not it is in view, and the viewport
   * copy of those same sites would draw twice.
   */
  const mapResults = useMemo(() => {
    if (!selectedId) return viewportResults;
    return [
      ...viewportResults.filter((r) => r.site.hybasId !== selectedId),
      ...catchmentResults,
    ];
  }, [viewportResults, catchmentResults, selectedId]);

  const selectedResult = useMemo(
    () => catchmentResults.find((r) => r.site.id === selectedSiteId) ?? null,
    [catchmentResults, selectedSiteId],
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
   * The drill-down is region, then catchment, then site, but a catchment can be opened
   * directly and its region follows it. Sending the view back out to a continent the user
   * had already zoomed past was the behaviour Mike Kittridge reported on 25 Aug 2026.
   */
  const handleSelectCatchment = useCallback(
    (id: string) => {
      const picked = index?.catchments.find((c) => c.id === id);
      if (!picked) return;
      setRegion(picked.region);
      if (picked.bbox) setBbox(picked.bbox);
      setSelectedId(id);
      setSelectedSiteId(null);
    },
    [index],
  );

  // Only sites inside the open catchment are clickable, so this never changes the region.
  const handleSelectSite = useCallback((id: string | null) => setSelectedSiteId(id), []);

  const handleQueryChange = useCallback((next: Query) => setQuery(next), []);
  const handleToggleSites = useCallback((show: boolean) => setShowSites(show), []);

  /**
   * Leaflet hands back a fresh bounds object on every settle, so an equality check keeps a
   * pan that lands on the same rectangle from resolving the same sites again.
   */
  const handleViewportChange = useCallback((next: LatLngBounds) => {
    setViewBounds((held) => (held && held.equals(next) ? held : next));
  }, []);

  return (
    // Side-by-side from 768px up. At 900px stacking would cut the panel mid-control
    // for no reason. Only narrow screens stack.
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
          nutrient={query.nutrient}
          results={mapResults}
          selectedSiteId={selectedSiteId}
          bbox={bbox}
          showSites={showSites}
          loading={loading}
          onSelectCatchment={handleSelectCatchment}
          onSelectSite={handleSelectSite}
          onJumpRegion={handleRegionChange}
          onViewportChange={handleViewportChange}
        />
      </main>
    </div>
  );
}
