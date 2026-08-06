"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

import type { CatchmentOutlineProps, CatchmentOutlines as OutlineCollection } from "@/lib/types";

interface Props {
  outlines: OutlineCollection | null;
  country: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const IDLE: L.PathOptions = {
  color: "#475569",
  weight: 1.5,
  opacity: 0.9,
  fillColor: "#94a3b8",
  fillOpacity: 0.18,
};

/** Selected catchment keeps its edge but drops the fill so reaches stay readable. */
const ACTIVE: L.PathOptions = {
  color: "#0f172a",
  weight: 2.5,
  opacity: 1,
  fillOpacity: 0,
};

function outlineStyle(id: string, selectedId: string | null): L.PathOptions {
  return id === selectedId ? ACTIVE : IDLE;
}

/** Catchment boundaries for the active country — the second step of the drill-down. */
export default function CatchmentOutlines({
  outlines,
  country,
  selectedId,
  onSelect,
}: Props) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON<CatchmentOutlineProps> | null>(null);
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  useEffect(() => {
    if (!outlines) return;

    const layer = L.geoJSON<CatchmentOutlineProps>(outlines, {
      filter: (feature) => feature.properties.country === country,
      style: (feature) =>
        outlineStyle(feature!.properties.id as string, selectedRef.current),
      onEachFeature: (feature, lyr) => {
        lyr.bindTooltip(feature.properties.name, { sticky: true });
        lyr.on("click", () => onSelect(feature.properties.id));
      },
    });

    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      layer.remove();
      layerRef.current = null;
    };
  }, [outlines, country, map, onSelect]);

  useEffect(() => {
    layerRef.current?.setStyle((feature) =>
      outlineStyle(feature!.properties.id as string, selectedId),
    );
  }, [selectedId]);

  return null;
}
