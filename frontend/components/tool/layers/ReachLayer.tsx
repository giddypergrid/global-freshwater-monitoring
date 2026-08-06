"use client";

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { detectionPower, powerColour } from "@/lib/power";
import type { Query, ReachProps } from "@/lib/types";

type ReachCollection = GeoJSON.FeatureCollection<GeoJSON.LineString, ReachProps>;

interface Props {
  reaches: ReachCollection | null;
  query: Query;
  onSelect: (reach: ReachProps | null) => void;
}

/** Bigger rivers draw thicker, so the trunk reads at a glance. */
function reachWeight(order: number): number {
  if (order >= 7) return 4.5;
  if (order === 6) return 3.5;
  if (order === 5) return 2.5;
  if (order === 4) return 1.8;
  return 1.2;
}

function reachStyle(props: ReachProps, query: Query): L.PathOptions {
  const power = detectionPower(
    props.cv[query.indicator],
    query.reduction,
    query.years,
    query.samplesPerYear,
  );
  return {
    color: powerColour(power),
    weight: reachWeight(props.ord),
    opacity: 1,
  };
}

/**
 * River reaches coloured by detection power.
 *
 * The layer is built once per catchment and only restyled when the query changes —
 * rebuilding thousands of paths on every slider tick is what makes these maps crawl.
 */
export default function ReachLayer({ reaches, query, onSelect }: Props) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON<ReachProps> | null>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    if (!reaches) return;

    // Canvas rendering comes from `preferCanvas` on the map — SVG chokes on thousands of paths.
    const layer = L.geoJSON<ReachProps>(reaches, {
      style: (feature) => reachStyle(feature!.properties as ReachProps, queryRef.current),
      onEachFeature: (feature, lyr) => {
        lyr.on("click", () => onSelect(feature.properties as ReachProps));
      },
    });

    layer.addTo(map);
    layerRef.current = layer;

    return () => {
      layer.remove();
      layerRef.current = null;
    };
  }, [reaches, map, onSelect]);

  useEffect(() => {
    layerRef.current?.setStyle(
      (feature) => reachStyle(feature!.properties as ReachProps, query),
    );
  }, [query]);

  return null;
}
