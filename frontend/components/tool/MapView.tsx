"use client";

import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";

import FitBounds from "./layers/FitBounds";
import CatchmentOutlines from "./layers/CatchmentOutlines";
import RiverLayer from "./layers/RiverLayer";
import SiteLayer from "./layers/SiteLayer";
import ViewportWatcher from "./layers/ViewportWatcher";
import Legend from "./Legend";
import type { SiteResult } from "@/lib/summary";
import type {
  CatchmentOutlines as OutlineCollection,
  DataIndex,
  NutrientKey,
} from "@/lib/types";
import type { LatLngBounds } from "leaflet";

interface Props {
  outlines: OutlineCollection | null;
  index: DataIndex | null;
  region: string;
  nutrient: NutrientKey;
  selectedId: string | null;
  results: SiteResult[];
  selectedSiteId: string | null;
  bbox: [number, number, number, number] | null;
  showSites: boolean;
  loading: boolean;
  onSelectCatchment: (id: string) => void;
  onSelectSite: (id: string | null) => void;
  onJumpRegion: (region: string) => void;
  onViewportChange: (bounds: LatLngBounds) => void;
}

/**
 * Neutral grey basemap. The data carries the colour, not the terrain.
 *
 * This was CARTO's light_all until 27 Aug 2026, when CARTO began stamping
 * "API KEY REQUIRED" across every key-free tile, including the ones the live site was
 * already serving. Esri's World Light Gray Base needs no key and no account.
 */
const BASEMAP =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";

/** Esri stops publishing this layer above zoom 16; Leaflet then upscales the last tile. */
const BASEMAP_MAX_ZOOM = 16;
/** Full extent of one world, in Leaflet's [south, west], [north, east] order. */
const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [-85, -180],
  [85, 180],
];

const ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · rivers <a href="https://www.hydrosheds.org/products/hydrorivers">HydroRIVERS</a> (HydroSHEDS, WWF)';

export default function MapView({
  outlines,
  index,
  region,
  nutrient,
  selectedId,
  results,
  selectedSiteId,
  bbox,
  showSites,
  loading,
  onSelectCatchment,
  onSelectSite,
  onJumpRegion,
  onViewportChange,
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
        {/* `bounds` stops noWrap asking for x=-1 and x=4 at zoom 2, which the tile server
            answers with an error rather than an empty tile. */}
        <TileLayer
          url={BASEMAP}
          attribution={ATTRIBUTION}
          noWrap
          bounds={WORLD_BOUNDS}
          maxNativeZoom={BASEMAP_MAX_ZOOM}
        />
        <ViewportWatcher onChange={onViewportChange} />
        <FitBounds bbox={bbox} />
        <CatchmentOutlines
          outlines={outlines}
          catchments={index?.catchments ?? []}
          region={region}
          nutrient={nutrient}
          selectedId={selectedId}
          onSelect={onSelectCatchment}
          onJumpRegion={onJumpRegion}
        />
        <RiverLayer selectedCatchmentId={selectedId} />
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

      <Legend showRivers={Boolean(selectedId)} />
    </div>
  );
}
