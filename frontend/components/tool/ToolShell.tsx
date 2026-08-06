"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import ControlPanel from "./panel/ControlPanel";
import type {
  CatchmentDetail,
  CatchmentOutlines,
  DataIndex,
  Query,
  Selection,
} from "@/lib/types";

/** Leaflet touches `window` on import, so the map only ever renders in the browser. */
const MapView = dynamic(() => import("./MapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-slate-100 text-sm text-slate-400">
      Loading map…
    </div>
  ),
});

const DEFAULT_QUERY: Query = {
  indicator: "tn",
  years: 10,
  samplesPerYear: 12,
  reduction: 20,
};

export default function ToolShell() {
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [outlines, setOutlines] = useState<CatchmentOutlines | null>(null);
  const [country, setCountry] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CatchmentDetail | null>(null);
  const [query, setQuery] = useState<Query>(DEFAULT_QUERY);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSites, setShowSites] = useState(true);

  useEffect(() => {
    async function load() {
      const [indexRes, outlineRes] = await Promise.all([
        fetch("/data/index.json"),
        fetch("/data/catchments.geojson"),
      ]);
      const indexData: DataIndex = await indexRes.json();
      const outlineData: CatchmentOutlines = await outlineRes.json();

      // ?country= / ?catchment= make a view shareable; the catchment wins if both are set.
      const params = new URLSearchParams(window.location.search);
      const fromUrl = indexData.catchments.find((c) => c.id === params.get("catchment"));
      const namedCountry = indexData.countries.find((c) => c.name === params.get("country"));
      const initialCountry =
        fromUrl?.country ?? namedCountry?.name ?? indexData.defaultCountry;

      setIndex(indexData);
      setOutlines(outlineData);
      setCountry(initialCountry);

      if (fromUrl) {
        setSelectedId(fromUrl.id);
      } else {
        setBbox(indexData.countries.find((c) => c.name === initialCountry)?.bbox ?? null);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!country) return;
    const params = new URLSearchParams({ country });
    if (selectedId) params.set("catchment", selectedId);
    window.history.replaceState(null, "", `?${params.toString()}`);
  }, [country, selectedId]);

  useEffect(() => {
    // Drop the previous catchment straight away. Without this its reaches stay on the
    // map while the next file downloads, so a fast click shows one catchment's outline
    // over another's rivers.
    setDetail(null);
    setSelection(null);

    if (!selectedId) return;
    let cancelled = false;
    setLoading(true);

    fetch(`/data/catchments/${selectedId}.json`)
      .then((res) => res.json())
      .then((data: CatchmentDetail) => {
        if (cancelled) return;
        setDetail(data);
        setBbox(data.bbox);
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const handleCountryChange = useCallback(
    (name: string) => {
      setCountry(name);
      setSelectedId(null);
      setSelection(null);
      setBbox(index?.countries.find((c) => c.name === name)?.bbox ?? null);
    },
    [index],
  );

  // Search spans every country, so picking a result may also move the country.
  // The index already knows the bbox, so the map moves on click instead of waiting
  // for the catchment file to download.
  const handleSelectCatchment = useCallback(
    (id: string) => {
      const picked = index?.catchments.find((c) => c.id === id);
      if (picked) {
        if (picked.country !== country) setCountry(picked.country);
        setBbox(picked.bbox);
      }
      setSelectedId(id);
    },
    [index, country],
  );
  const handleSelectFeature = useCallback((next: Selection | null) => setSelection(next), []);
  const handleQueryChange = useCallback((next: Query) => setQuery(next), []);
  const handleToggleSites = useCallback((show: boolean) => setShowSites(show), []);

  // Fills whatever the parent gives it — a page section on the landing page, the
  // whole viewport on /tool.
  return (
    // Side-by-side from 768px up — at 900px stacking would cut the panel mid-control
    // for no reason. Only genuinely narrow screens stack.
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      {/* ControlPanel owns the scrolling, so no overflow here or you get two scrollbars. */}
      <aside className="max-h-[45%] w-full shrink-0 border-b border-slate-200 md:max-h-none md:w-[320px] md:border-r md:border-b-0 lg:w-[360px]">
        {index ? (
          <ControlPanel
            index={index}
            country={country}
            selectedId={selectedId}
            detail={detail}
            query={query}
            selection={selection}
            loading={loading}
            showSites={showSites}
            onCountryChange={handleCountryChange}
            onSelectCatchment={handleSelectCatchment}
            onQueryChange={handleQueryChange}
            onToggleSites={handleToggleSites}
          />
        ) : (
          <div className="p-4 text-sm text-slate-400">Loading…</div>
        )}
      </aside>

      <main className="min-h-[320px] min-w-0 flex-1">
        <MapView
          outlines={outlines}
          country={country}
          selectedId={selectedId}
          detail={detail}
          query={query}
          bbox={bbox}
          showSites={showSites}
          loading={loading}
          onSelectCatchment={handleSelectCatchment}
          onSelectFeature={handleSelectFeature}
        />
      </main>
    </div>
  );
}
