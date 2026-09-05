"use client";

import { useEffect, useMemo, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { formatPower, powerColour } from "@/lib/power";
import { withinBounds } from "@/lib/geo";
import type { SiteResult } from "@/lib/summary";

interface Props {
  results: SiteResult[];
  selectedCatchmentId: string | null;
  selectedSiteId: string | null;
  region: string;
  visible: boolean;
  onSelect: (id: string | null) => void;
}

/**
 * How a background dot is sized and spaced at each zoom, in screen pixels.
 *
 * `cell` is the thinning grid: one site is drawn per cell, so it sets how far apart two
 * drawn dots can be. `radius` is the dot itself. They move in opposite directions on
 * purpose. A wide view wants small dots spread far enough apart to read as a pattern and
 * to leave the country names underneath legible; a close view wants every site, drawn
 * large enough to click. Keeping `cell` near three times `radius` leaves about a dot's
 * width of gap between neighbours, which is what stops the dense parts of France from
 * filling in as one solid sheet.
 *
 * This replaced a flat `MAX_MARKERS = 4000` cap on 4 Sep 2026. That cap walked the site
 * list in file order and stopped dead once it had drawn 4,000, so at Europe-wide zoom
 * 7,205 sites were in view, 4,000 were drawn, and the other 3,205 vanished. That was
 * 46.6% of France's sites against 98-100% of Germany's, the UK's and Poland's, purely
 * because France has more sites and its own tail ran past the cutoff. That is the "odd
 * site plotting at different zoom scales" Mike Kittridge reported on 3 Sep 2026.
 *
 * A `cell` of 0 switches thinning off, and every site in view is drawn. Thinning exists
 * only to stop dots painting over each other, so once the view is close enough for the
 * sites to sit apart on screen it should stop taking any away. Leaving it on to zoom 8 was
 * still costing real sites: over France it drew 1,509 of the 1,748 in view, 86%.
 *
 * `catchment` sizes the open catchment's own dots, which are never thinned. It grows more
 * slowly than it used to because a fat dot merges its neighbours: catchment 2060569180
 * holds 227 sites, and at zoom 8 a radius of 7 left only 42 of them visually separate
 * against 88 at a radius of 4, measured on 5 Sep 2026.
 */
function dotScale(zoom: number): { cell: number; radius: number; catchment: number } {
  if (zoom <= 3) return { cell: 8, radius: 1.6, catchment: 3.5 };
  if (zoom <= 5) return { cell: 6.5, radius: 2, catchment: 4 };
  if (zoom <= 6) return { cell: 6, radius: 2.6, catchment: 4.5 };
  if (zoom <= 9) return { cell: 0, radius: 3, catchment: 5.5 };
  return { cell: 0, radius: 3.6, catchment: 7 };
}

/** FNV-1a. A stable number per site id, so the same site always sorts the same way. */
function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * One site per screen cell, chosen by the hash of its id.
 *
 * The choice deliberately ignores power. Keeping the weakest site per cell would paint the
 * map redder than the data, keeping the strongest would paint it greener; picking on
 * something unrelated to the measurement leaves the visible colours an unbiased sample of
 * the real ones.
 *
 * It ignores position too, and that is the point. An earlier version kept the site nearest
 * each cell centre, which put every dot in a dense region at almost the same offset inside
 * its cell and drew France as a visible lattice of evenly spaced rows and columns. A reader
 * could reasonably have taken that regularity for something in the data. Selecting on the
 * hash leaves each dot wherever its site actually is inside the cell, so the spacing stays
 * irregular the way the real coordinates are.
 *
 * The hash is fixed per site, so a redraw picks the same site again. That matters because
 * 720 of the 7,010 sites in a Europe-wide view share an exact coordinate with another site,
 * measured on 4 Sep 2026, and anything decided by list order would hand a cell's colour to
 * a different co-located site between redraws, which reads as dots flickering while the map
 * is panned.
 */
function thinToScreenGrid(
  results: SiteResult[],
  map: L.Map,
  cell: number,
): SiteResult[] {
  if (cell <= 0) return results;

  const best = new Map<string, { result: SiteResult; rank: number }>();

  for (const result of results) {
    const point = map.latLngToLayerPoint([result.site.lat, result.site.lon]);
    const key = `${Math.round(point.x / cell)}:${Math.round(point.y / cell)}`;
    const rank = hashId(result.site.id);

    const held = best.get(key);
    if (!held || rank < held.rank) best.set(key, { result, rank });
  }

  return Array.from(best.values(), (entry) => entry.result);
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
  const drawRef = useRef<(() => void) | null>(null);
  const selectRef = useRef(onSelect);

  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  // The opening world view is a catchment picker, so it carries no sites: spraying every
  // marker over it invites the user to zoom to a site and then click a catchment, which
  // is the trip Mike Kittridge reported on 25 Aug 2026. Once a region is chosen its own
  // sites are drawn as context. Once a catchment is open, its sites come first and always
  // draw.
  const { catchmentSites, contextSites } = useMemo(() => {
    if (!selectedCatchmentId) {
      const context = region ? results.filter((r) => r.site.region === region) : [];
      return { catchmentSites: [], contextSites: context };
    }
    const inside: SiteResult[] = [];
    const outside: SiteResult[] = [];
    for (const result of results) {
      if (result.site.hybasId === selectedCatchmentId) inside.push(result);
      else outside.push(result);
    }
    return { catchmentSites: inside, contextSites: outside };
  }, [results, selectedCatchmentId, region]);

  // The group and the `moveend` binding outlive the data. Rebuilding them whenever the
  // resolved sites change would drop and re-add the canvas on every pan, now that the
  // sites are resolved per viewport and so arrive as a new array each time.
  useEffect(() => {
    if (!visible) return;

    const group = L.layerGroup().addTo(map);
    layerRef.current = group;
    const redraw = () => drawRef.current?.();

    // `moveend` alone, not `moveend zoomend`. A zoom fires both, verified against the
    // running map on 4 Sep 2026, so listening to the pair ran this whole redraw twice for
    // every zoom step. A pan fires `moveend` on its own, so this still catches every move.
    map.on("moveend", redraw);

    return () => {
      map.off("moveend", redraw);
      group.remove();
      layerRef.current = null;
    };
  }, [map, visible]);

  useEffect(() => {
    const group = layerRef.current;
    if (!group) return;

    const add = (result: SiteResult, inCatchment: boolean, size: ReturnType<typeof dotScale>) => {
      const { site } = result;
      const isSelected = site.id === selectedSiteId;
      const marker = L.circleMarker([site.lat, site.lon], {
        // Only sites in the open catchment take clicks. Everything else is context, and
        // making it inert stops a stray click from jumping the whole drill-down.
        interactive: inCatchment,
        // The catchment's own dots scale with the view like the background ones. Held at a
        // flat 7 they merged into one shape at wide zoom, which is what a catchment with a
        // few hundred sites looked like on the coast of southern France.
        radius: isSelected
          ? size.catchment + 2
          : inCatchment
            ? size.catchment
            : size.radius,
        fillColor: powerColour(result.power),
        fillOpacity: inCatchment ? 1 : 0.75,
        color: isSelected ? "#b45309" : "#0f172a",
        weight: isSelected ? 2.5 : inCatchment ? 1 : 0.4,
      });

      if (inCatchment) {
        marker.bindTooltip(
          // `site.siteId`, not `site.id`: the latter is the app's `TP::WQ958388` lookup key.
          `${site.siteId}<br>power ${formatPower(result.power)} · ${site.current.toPrecision(3)} mg/L`,
          { sticky: true },
        );
        marker.on("click", () => selectRef.current(site.id));
      }
      marker.addTo(group);
    };

    const draw = () => {
      group.clearLayers();
      const isInView = withinBounds(map.getBounds());
      const size = dotScale(map.getZoom());

      // Context first: the canvas paints in insertion order, so anything added later sits
      // on top. Drawing the open catchment first left its own sites buried under the
      // background dots of whatever else was on screen.
      for (const result of thinToScreenGrid(
        contextSites.filter((r) => isInView(r.site.lat, r.site.lon)),
        map,
        size.cell,
      )) {
        add(result, false, size);
      }

      // The open catchment is the thing being analysed, so it is never thinned and never
      // clipped to the viewport. Panning its sites half off screen must not delete them.
      const selected: SiteResult[] = [];
      for (const result of catchmentSites) {
        if (result.site.id === selectedSiteId) selected.push(result);
        else add(result, true, size);
      }
      for (const result of selected) add(result, true, size);
    };

    drawRef.current = draw;
    draw();
  }, [catchmentSites, contextSites, selectedSiteId, visible, map]);

  return null;
}
