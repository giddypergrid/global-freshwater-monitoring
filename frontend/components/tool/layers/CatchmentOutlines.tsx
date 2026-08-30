"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

import type {
  CatchmentOutlineProps,
  CatchmentOutlines as OutlineCollection,
  CatchmentSummary,
} from "@/lib/types";

interface Props {
  outlines: OutlineCollection | null;
  catchments: CatchmentSummary[];
  region: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onJumpRegion: (region: string) => void;
}

const IDLE: L.PathOptions = {
  color: "#475569",
  weight: 1,
  opacity: 0.8,
  fillColor: "#94a3b8",
  fillOpacity: 0.12,
};

/** Another region: still drawn and still clickable, just quieter than the active one. */
const OTHER: L.PathOptions = {
  color: "#94a3b8",
  weight: 0.9,
  opacity: 0.85,
  fillColor: "#cbd5e1",
  fillOpacity: 0.1,
};

/** Selected catchment keeps its edge but drops the fill so its sites stay readable. */
const ACTIVE: L.PathOptions = {
  color: "#0f172a",
  weight: 2.5,
  opacity: 1,
  fillOpacity: 0,
};

/** What the next click would take. Snapping means it is often not under the cursor. */
const HOVER: L.PathOptions = {
  color: "#0f172a",
  weight: 2,
  opacity: 1,
  fillColor: "#64748b",
  fillOpacity: 0.35,
};

/** How far a click may miss a catchment and still count, in screen pixels. */
const SNAP_PX = 60;

/**
 * Draws every catchment and owns all map hit-testing.
 *
 * 1,177 catchments cover 2.55% of the world and the median one is under 3 px across at
 * world zoom, so requiring an exact hit is not a fair ask. With no region chosen the map
 * is a region picker and any click lands on the nearest continent; once a region is open
 * a click takes the polygon under the cursor, else the nearest centre within SNAP_PX.
 */
export default function CatchmentOutlines({
  outlines,
  catchments,
  region,
  selectedId,
  onSelect,
  onJumpRegion,
}: Props) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const selectedRef = useRef(selectedId);
  const regionRef = useRef(region);

  /** Every drawn path by id, so hover restyles two shapes instead of all 1,177. */
  const pathById = useRef(new Map<string, L.Path>());
  /** Catchment centres in lat/lng, projected to pixels only when the view moves. */
  const centres = useRef<{ id: string; lat: number; lng: number }[]>([]);
  const projected = useRef<{ id: string; x: number; y: number }[]>([]);
  /** Set while the cursor is genuinely inside a polygon; an exact hit beats any snap. */
  const exactId = useRef<string | null>(null);
  const hoverId = useRef<string | null>(null);

  useEffect(() => {
    selectedRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    regionRef.current = region;
  }, [region]);

  const regionOf = useMemo(
    () => new Map(catchments.map((c) => [c.id, c.region])),
    [catchments],
  );

  const recordsOf = useMemo(
    () => new Map(catchments.map((c) => [c.id, c.records])),
    [catchments],
  );

  const styleFor = useCallback(
    (id: string, activeId: string | null): L.PathOptions => {
      if (id === activeId) return ACTIVE;
      // Before a region is picked every catchment reads the same, with none demoted yet.
      if (!region) return IDLE;
      return regionOf.get(id) === region ? IDLE : OTHER;
    },
    [regionOf, region],
  );

  const styleRef = useRef(styleFor);
  useEffect(() => {
    styleRef.current = styleFor;
  }, [styleFor]);

  useEffect(() => {
    if (!outlines) return;

    const paths = new Map<string, L.Path>();
    const points: { id: string; lat: number; lng: number }[] = [];

    const layer = L.geoJSON(outlines, {
      style: (feature) =>
        styleRef.current(
          (feature!.properties as CatchmentOutlineProps).id,
          selectedRef.current,
        ),
      onEachFeature: (feature, lyr) => {
        const { id } = feature.properties as CatchmentOutlineProps;
        paths.set(id, lyr as L.Path);
        const centre = (lyr as L.Polygon).getBounds().getCenter();
        points.push({ id, lat: centre.lat, lng: centre.lng });
        // An exact hit outranks the snap, so the polygon reports when it owns the cursor.
        lyr.on("mouseover", () => {
          exactId.current = id;
        });
        lyr.on("mouseout", () => {
          if (exactId.current === id) exactId.current = null;
        });
      },
    });

    pathById.current = paths;
    centres.current = points;
    layer.addTo(map);
    layer.bringToBack();
    layerRef.current = layer;

    return () => {
      layer.remove();
      layerRef.current = null;
      pathById.current = new Map();
      centres.current = [];
    };
  }, [outlines, map]);

  // Hit-testing, hover highlight and clicks. One tooltip is shared by every catchment so
  // the snapped target can be labelled even when the cursor is over empty map.
  useEffect(() => {
    const tip = L.tooltip({ sticky: true });

    function reproject() {
      projected.current = centres.current.map(({ id, lat, lng }) => {
        const point = map.latLngToContainerPoint([lat, lng]);
        return { id, x: point.x, y: point.y };
      });
    }

    function nearest(point: L.Point) {
      let id: string | null = null;
      let dist = Infinity;
      for (const centre of projected.current) {
        const d = Math.hypot(centre.x - point.x, centre.y - point.y);
        if (d < dist) {
          dist = d;
          id = centre.id;
        }
      }
      return { id, dist };
    }

    function paint(id: string | null, style: L.PathOptions | null) {
      if (!id) return;
      pathById.current
        .get(id)
        ?.setStyle(style ?? styleRef.current(id, selectedRef.current));
    }

    function setHover(id: string | null) {
      if (hoverId.current === id) return;
      paint(hoverId.current, null);
      hoverId.current = id;
      // The selected catchment keeps its own emphasis rather than flashing a second one.
      if (id && id !== selectedRef.current) paint(id, HOVER);
    }

    /** What a click at this point would take. */
    function targetAt(point: L.Point) {
      // Step one of the drill-down: before a region is chosen the target is a continent,
      // so the click never has to be near anything.
      const regionMode = !regionRef.current;
      const snap = nearest(point);
      const exact = exactId.current;
      const id = exact ?? (regionMode || snap.dist <= SNAP_PX ? snap.id : null);
      return {
        id,
        home: id ? (regionOf.get(id) ?? null) : null,
        regionMode,
        // The cursor is inside the polygon, so the user is aiming at this catchment and
        // not at the continent it happens to sit in.
        exact: exact !== null,
      };
    }

    function onMove(event: L.LeafletMouseEvent) {
      const target = targetAt(event.containerPoint);
      // A snapped click in region mode takes a continent, so highlighting one polygon
      // would lie about what happens next. An exact hit does open that polygon.
      setHover(target.regionMode && !target.exact ? null : target.id);

      if (!target.id || !target.home) {
        map.getContainer().style.cursor = "";
        if (map.hasLayer(tip)) map.removeLayer(tip);
        return;
      }
      map.getContainer().style.cursor = "pointer";

      const away = regionRef.current && target.home !== regionRef.current;
      tip.setContent(
        target.exact
          ? `${target.id} · ${recordsOf.get(target.id) ?? 0} site records`
          : target.regionMode
            ? `${target.home} · click to zoom in`
            : away
              ? `${target.home} · click to switch region`
              : `${target.id} · ${recordsOf.get(target.id) ?? 0} site records`,
      );
      tip.setLatLng(event.latlng);
      if (!map.hasLayer(tip)) tip.addTo(map);
    }

    function onOut() {
      setHover(null);
      map.getContainer().style.cursor = "";
      if (map.hasLayer(tip)) map.removeLayer(tip);
    }

    function onClick(event: L.LeafletMouseEvent) {
      const target = targetAt(event.containerPoint);
      if (!target.id || !target.home) return;
      // An exact hit opens that catchment wherever it sits, and the region follows it.
      // Zooming the user back out to a continent they had already zoomed past was the
      // behaviour Mike Kittridge reported on 25 Aug 2026.
      if (target.exact) {
        onSelect(target.id);
        return;
      }
      // A snapped click from far out is still a region pick: at world zoom the median
      // catchment is under 3 px across, so the polygon under the cursor means little.
      if (target.regionMode || (regionRef.current && target.home !== regionRef.current)) {
        if (target.home !== regionRef.current) onJumpRegion(target.home);
        return;
      }
      onSelect(target.id);
    }

    reproject();
    map.on("moveend zoomend", reproject);
    map.on("mousemove", onMove);
    map.on("mouseout", onOut);
    map.on("click", onClick);
    return () => {
      map.off("moveend zoomend", reproject);
      map.off("mousemove", onMove);
      map.off("mouseout", onOut);
      map.off("click", onClick);
      if (map.hasLayer(tip)) map.removeLayer(tip);
      map.getContainer().style.cursor = "";
      hoverId.current = null;
    };
  }, [map, outlines, regionOf, recordsOf, onSelect, onJumpRegion]);

  useEffect(() => {
    hoverId.current = null;
    layerRef.current?.setStyle((feature) =>
      styleFor((feature!.properties as CatchmentOutlineProps).id, selectedId),
    );
  }, [selectedId, styleFor]);

  return null;
}
