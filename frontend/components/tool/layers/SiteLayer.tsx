"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { formatPower, powerColour } from "@/lib/power";
import type { SiteResult } from "@/lib/summary";

interface Props {
  results: SiteResult[];
  selectedCatchmentId: string | null;
  selectedSiteId: string | null;
  region: string;
  visible: boolean;
  onSelect: (id: string | null) => void;
}

/** 15,313 markers would crawl. Only what is on screen is drawn. */
const MAX_MARKERS = 4000;

function radius(inCatchment: boolean, isSelected: boolean): number {
  if (isSelected) return 9;
  return inCatchment ? 7 : 3;
}

export default function SiteLayer({
  results,
  selectedCatchmentId,
  selectedSiteId,
  region,
  visible,
  onSelect,
}: Props) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);
  const selectRef = useRef(onSelect);

  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  // Until a catchment is open the sites are context only, so the region's own sites are
  // all that is worth drawing. Once it is open, its sites come first and always draw.
  const ordered = useMemo(() => {
    if (!selectedCatchmentId) {
      return region ? results.filter((r) => r.site.region === region) : results;
    }
    return [...results].sort((a, b) => {
      const inA = a.site.hybasId === selectedCatchmentId ? 0 : 1;
      const inB = b.site.hybasId === selectedCatchmentId ? 0 : 1;
      return inA - inB;
    });
  }, [results, selectedCatchmentId, region]);

  useEffect(() => {
    if (!visible) return;

    const group = L.layerGroup().addTo(map);
    layerRef.current = group;

    const draw = () => {
      group.clearLayers();
      const bounds = map.getBounds();
      let drawn = 0;

      for (const result of ordered) {
        const { site } = result;
        const inCatchment = site.hybasId === selectedCatchmentId;
        if (!inCatchment && !bounds.contains([site.lat, site.lon])) continue;
        if (drawn >= MAX_MARKERS) break;
        drawn += 1;

        const isSelected = site.id === selectedSiteId;
        const marker = L.circleMarker([site.lat, site.lon], {
          // Only sites in the open catchment take clicks. Everything else is context, and
          // making it inert stops a stray click from jumping the whole drill-down.
          interactive: inCatchment,
          radius: radius(inCatchment, isSelected),
          fillColor: powerColour(result.power),
          fillOpacity: inCatchment ? 1 : 0.55,
          color: isSelected ? "#b45309" : "#0f172a",
          weight: isSelected ? 2.5 : inCatchment ? 1 : 0.5,
        });

        if (inCatchment) {
          marker.bindTooltip(
            `${site.id}<br>power ${formatPower(result.power)} · ${site.current.toPrecision(3)} mg/L`,
            { sticky: true },
          );
          marker.on("click", () => selectRef.current(site.id));
        }
        marker.addTo(group);
      }
    };

    draw();
    map.on("moveend zoomend", draw);

    return () => {
      map.off("moveend zoomend", draw);
      group.remove();
      layerRef.current = null;
    };
  }, [ordered, selectedCatchmentId, selectedSiteId, visible, map]);

  return null;
}
