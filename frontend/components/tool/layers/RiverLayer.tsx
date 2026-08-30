"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

import { loadRivers } from "@/lib/data";
import type { RiverShard } from "@/lib/types";

interface Props {
  selectedCatchmentId: string | null;
}

/**
 * Draws the river network inside the open catchment.
 *
 * Context only. Power is calculated at monitored sites and has not been extrapolated to
 * river reaches, so the lines carry no colour scale, only a width by Strahler order. Mike
 * Kittridge asked for this on 25 Aug 2026 so a reader can see how the sites in a catchment
 * are connected.
 */

/** Blue enough to read as water against the grey basemap, quiet enough to stay behind. */
const RIVER_COLOUR = "#2b7fb8";

/** Strahler order to line weight. Order 1 is a headwater stream, 9 is the Amazon. */
function weightFor(order: number): number {
  if (order >= 7) return 2.4;
  if (order >= 5) return 1.7;
  if (order >= 3) return 1.1;
  return 0.7;
}

function opacityFor(order: number): number {
  return order >= 5 ? 0.75 : 0.5;
}

export default function RiverLayer({ selectedCatchmentId }: Props) {
  const map = useMap();
  // Kept with the id it was fetched for, so a stale shard is never drawn over the
  // catchment that replaced it.
  const [loaded, setLoaded] = useState<{ id: string; shard: RiverShard } | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!selectedCatchmentId) return;
    let cancelled = false;
    // All 1,177 catchments have a shard, so this fetches straight to the file rather than
    // spending 66 kB of every first visit on a manifest that would always say yes. A
    // catchment with no shard leaves the map without rivers instead of failing.
    loadRivers(selectedCatchmentId)
      .then((shard) => {
        if (!cancelled) setLoaded({ id: selectedCatchmentId, shard });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedCatchmentId]);

  useEffect(() => {
    const shard = loaded && loaded.id === selectedCatchmentId ? loaded.shard : null;
    if (!shard) return;

    const group = L.layerGroup().addTo(map);
    layerRef.current = group;

    for (const [order, flat] of shard.r) {
      const points: [number, number][] = [];
      // The shard stores [lon, lat, lon, lat, ...]; Leaflet wants [lat, lng] pairs.
      for (let i = 0; i < flat.length; i += 2) {
        points.push([flat[i + 1], flat[i]]);
      }
      L.polyline(points, {
        color: RIVER_COLOUR,
        weight: weightFor(order),
        opacity: opacityFor(order),
        interactive: false,
      }).addTo(group);
    }

    // Under the site markers and the catchment edge, which are what gets clicked.
    group.eachLayer((layer) => (layer as L.Polyline).bringToBack());

    return () => {
      group.remove();
      layerRef.current = null;
    };
  }, [loaded, selectedCatchmentId, map]);

  return null;
}
