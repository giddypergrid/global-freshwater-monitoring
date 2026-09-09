"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GeoJSON,
  MapContainer,
  TileLayer,
  useMapEvents,
} from "react-leaflet";
import type {
  LatLngBounds,
  LeafletMouseEvent,
  Layer,
} from "leaflet";

import "leaflet/dist/leaflet.css";

import {
  bboxIntersects,
  loadModelledIndex,
  loadModelledShard,
  type ModelledFeature,
  type ModelledFrequency,
  type ModelledIndex,
} from "@/lib/modelled";

import {
  powerColour,
  powerForReduction,
} from "@/lib/power";

type Nutrient = "tn" | "tp";

interface Props {
  nutrient: Nutrient;
  frequency: ModelledFrequency;
  years: number;
  reduction: number;
  selectedId: number | null;
  onSelect: (feature: ModelledFeature | null) => void;
}

const BASEMAP =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";

const WORLD_BOUNDS: [[number, number], [number, number]] = [
  [-85, -180],
  [85, 180],
];

const MIN_MODELLED_ZOOM = 5;

function boundsToBbox(
  bounds: LatLngBounds,
): [number, number, number, number] {
  return [
    bounds.getWest(),
    bounds.getSouth(),
    bounds.getEast(),
    bounds.getNorth(),
  ];
}

interface ViewState {
  bounds: LatLngBounds;
  zoom: number;
}

function ViewportLoader({
  onChange,
}: {
  onChange: (state: ViewState) => void;
}) {
  const map = useMapEvents({
    moveend() {
      onChange({
        bounds: map.getBounds(),
        zoom: map.getZoom(),
      });
    },
    zoomend() {
      onChange({
        bounds: map.getBounds(),
        zoom: map.getZoom(),
      });
    },
  });

  useEffect(() => {
    onChange({
      bounds: map.getBounds(),
      zoom: map.getZoom(),
    });
  }, [map, onChange]);

  return null;
}

function featurePower(
  feature: ModelledFeature,
  nutrient: Nutrient,
  frequency: ModelledFrequency,
  years: number,
  reduction: number,
  index: ModelledIndex,
): number {
  const at = index.years.indexOf(years);
  if (at < 0) return 0;

  const se =
    nutrient === "tn"
      ? feature.properties.tnse[frequency][at]
      : feature.properties.tpse[frequency][at];

  if (!(se > 0)) return 0;

  return powerForReduction(
    reduction,
    years,
    se,
  );
}

export default function ModelledMap({
  nutrient,
  frequency,
  years,
  reduction,
  selectedId,
  onSelect,
}: Props) {
  const [index, setIndex] = useState<ModelledIndex | null>(null);
  const [features, setFeatures] = useState<ModelledFeature[]>([]);
  const [view, setView] = useState<ViewState | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadModelledIndex().then(setIndex);
  }, []);

  const handleViewportChange = useCallback(
    (next: ViewState) => {
      setView((held) => {
        if (
          held &&
          held.zoom === next.zoom &&
          held.bounds.equals(next.bounds)
        ) {
          return held;
        }

        return next;
      });
    },
    [],
  );

  useEffect(() => {
    if (!index || !view) return;

    if (view.zoom < MIN_MODELLED_ZOOM) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);

      try {
        const viewport = boundsToBbox(view.bounds);

        const visibleShards = index.shards.filter((shard) =>
          bboxIntersects(shard.bbox, viewport),
        );

        const loaded = await Promise.all(
          visibleShards.map((shard) =>
            loadModelledShard(shard.file),
          ),
        );

        if (cancelled) return;

        setFeatures(
          loaded.flatMap((shard) => shard.features),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [index, view]);

  const zoomedOut =
    !view || view.zoom < MIN_MODELLED_ZOOM;

  const data = useMemo<GeoJSON.FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: zoomedOut ? [] : features,
    };
  }, [features, zoomedOut]);

  return (
    <div className="relative h-full w-full">
      <MapContainer
        center={[20, 10]}
        zoom={2}
        minZoom={2}
        preferCanvas
        zoomControl
        maxBounds={WORLD_BOUNDS}
        maxBoundsViscosity={1}
        className="h-full w-full"
      >
        <TileLayer
          url={BASEMAP}
          attribution="Tiles &copy; Esri, HERE, Garmin, OpenStreetMap contributors"
          noWrap
          bounds={WORLD_BOUNDS}
          maxNativeZoom={16}
        />

        <ViewportLoader onChange={handleViewportChange} />

        {index && data.features.length > 0 && (
          <GeoJSON
            key={`${nutrient}-${frequency}-${years}-${reduction}-${features.length}`}
            data={data}
            style={(rawFeature) => {
              const feature = rawFeature as ModelledFeature;

              const power = featurePower(
                feature,
                nutrient,
                frequency,
                years,
                reduction,
                index,
              );

              const selected =
                feature.properties.id === selectedId;

              return {
                color: selected ? "#111827" : "#64748b",
                weight: selected ? 2.5 : 0.6,
                fillColor: powerColour(power),
                fillOpacity: 0.65,
              };
            }}
            onEachFeature={(rawFeature, layer: Layer) => {
              const feature = rawFeature as ModelledFeature;

              layer.on({
                click: (event: LeafletMouseEvent) => {
                  event.originalEvent.stopPropagation();
                  onSelect(feature);
                },
              });
            }}
          />
        )}
      </MapContainer>

      {zoomedOut && (
        <div className="absolute top-3 left-1/2 z-[1000] -translate-x-1/2 rounded-full border border-slate-300 bg-white/95 px-3 py-1.5 text-xs text-slate-700 shadow-sm">
          Zoom in to view modelled catchments
        </div>
      )}

      {loading && !zoomedOut && (
        <div className="absolute top-3 left-1/2 z-[1000] -translate-x-1/2 rounded-full border border-slate-300 bg-white/95 px-3 py-1.5 text-xs text-slate-700 shadow-sm">
          Loading modelled catchments...
        </div>
      )}

      <div className="absolute right-3 bottom-3 z-[1000] rounded border border-slate-300 bg-white/95 px-3 py-2 text-xs shadow-sm">
        <div className="mb-1 font-semibold text-slate-800">
          Detection power
        </div>

        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-sm border border-slate-400"
            style={{ backgroundColor: "#d32f2f" }}
          />
          <span>&lt; 0.40</span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-sm border border-slate-400"
            style={{ backgroundColor: "#f9a825" }}
          />
          <span>0.40-0.79</span>
        </div>

        <div className="flex items-center gap-2">
          <span
            className="inline-block h-3 w-3 rounded-sm border border-slate-400"
            style={{ backgroundColor: "#2e7d32" }}
          />
          <span>0.80+</span>
        </div>
      </div>
    </div>
  );
}


