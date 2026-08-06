"use client";

import { useCallback } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import FitBounds from "./layers/FitBounds";
import CatchmentOutlines from "./layers/CatchmentOutlines";
import ReachLayer from "./layers/ReachLayer";
import SiteLayer from "./layers/SiteLayer";
import Legend from "./Legend";
import type {
  CatchmentDetail,
  CatchmentOutlines as OutlineCollection,
  Query,
  ReachProps,
  Selection,
  SiteProps,
} from "@/lib/types";

interface Props {
  outlines: OutlineCollection | null;
  country: string;
  selectedId: string | null;
  detail: CatchmentDetail | null;
  query: Query;
  bbox: [number, number, number, number] | null;
  showSites: boolean;
  loading: boolean;
  onSelectCatchment: (id: string) => void;
  onSelectFeature: (selection: Selection | null) => void;
}

/** Neutral grey basemap — the data carries the colour, not the terrain. */
const BASEMAP = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export default function MapView({
  outlines,
  country,
  selectedId,
  detail,
  query,
  bbox,
  showSites,
  loading,
  onSelectCatchment,
  onSelectFeature,
}: Props) {
  // Stable identities — the layers rebuild whenever these change.
  const handleReach = useCallback(
    (props: ReachProps | null) => onSelectFeature(props ? { kind: "reach", props } : null),
    [onSelectFeature],
  );
  const handleSite = useCallback(
    (props: SiteProps | null) => onSelectFeature(props ? { kind: "site", props } : null),
    [onSelectFeature],
  );

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[-41.1, 172.5]}
        zoom={5}
        preferCanvas
        zoomControl
        className="h-full w-full"
      >
        <TileLayer url={BASEMAP} attribution={ATTRIBUTION} />
        <FitBounds bbox={bbox} />
        <CatchmentOutlines
          outlines={outlines}
          country={country}
          selectedId={selectedId}
          onSelect={onSelectCatchment}
        />
        <ReachLayer
          reaches={detail?.reaches ?? null}
          query={query}
          onSelect={handleReach}
        />
        <SiteLayer
          sites={detail?.sites ?? null}
          query={query}
          visible={showSites}
          onSelect={handleSite}
        />
      </MapContainer>

      {loading && (
        <div className="absolute top-3 left-1/2 z-[1000] -translate-x-1/2 rounded-full border border-slate-300 bg-white/95 px-3 py-1.5 text-xs text-slate-600 shadow-sm">
          Loading catchment…
        </div>
      )}

      <Legend />
    </div>
  );
}
