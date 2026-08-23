"use client";

import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import FitBounds from "./layers/FitBounds";
import CatchmentOutlines from "./layers/CatchmentOutlines";
import SiteLayer from "./layers/SiteLayer";
import Legend from "./Legend";
import type { SiteResult } from "@/lib/summary";
import type {
  CatchmentOutlines as OutlineCollection,
  DataIndex,
} from "@/lib/types";

interface Props {
  outlines: OutlineCollection | null;
  index: DataIndex | null;
  region: string;
  selectedId: string | null;
  results: SiteResult[];
  selectedSiteId: string | null;
  bbox: [number, number, number, number] | null;
  showSites: boolean;
  loading: boolean;
  onSelectCatchment: (id: string) => void;
  onSelectSite: (id: string | null) => void;
  onJumpRegion: (region: string) => void;
}

/** Neutral grey basemap. The data carries the colour, not the terrain. */
const BASEMAP = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
/** Full extent of one world, in Leaflet's [south, west], [north, east] order. */
const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [-85, -180],
  [85, 180],
];

const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export default function MapView({
  outlines,
  index,
  region,
  selectedId,
  results,
  selectedSiteId,
  bbox,
  showSites,
  loading,
  onSelectCatchment,
  onSelectSite,
  onJumpRegion,
}: Props) {
  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[20, 10]}
        zoom={2}
        minZoom={2}
        preferCanvas
        zoomControl
        // One world only. Panning past the date line repeats the map and the sites do
        // not repeat with it, so a copy would look empty.
        maxBounds={WORLD_BOUNDS}
        maxBoundsViscosity={1}
        className="h-full w-full"
      >
        {/* `bounds` stops noWrap asking for x=-1 and x=4 at zoom 2, which CARTO 400s on. */}
        <TileLayer url={BASEMAP} attribution={ATTRIBUTION} noWrap bounds={WORLD_BOUNDS} />
        <FitBounds bbox={bbox} />
        <CatchmentOutlines
          outlines={outlines}
          catchments={index?.catchments ?? []}
          region={region}
          selectedId={selectedId}
          onSelect={onSelectCatchment}
          onJumpRegion={onJumpRegion}
        />
        <SiteLayer
          results={results}
          selectedCatchmentId={selectedId}
          selectedSiteId={selectedSiteId}
          region={region}
          visible={showSites}
          onSelect={onSelectSite}
        />
      </MapContainer>

      {loading && (
        <div className="absolute top-3 left-1/2 z-[1000] -translate-x-1/2 rounded-full border border-slate-300 bg-white/95 px-3 py-1.5 text-xs text-slate-700 shadow-sm">
          Loading power lookup…
        </div>
      )}

      <Legend />
    </div>
  );
}
