"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

interface Props {
  bbox: [number, number, number, number] | null;
  padding?: number;
}

/**
 * Keeps the map framed on the current bbox.
 *
 * Deliberately never animates. An animated fly takes 0.8s, and clicking through
 * catchments faster than that leaves interrupted flights that drift the view somewhere
 * between two targets. Snapping is instant, deterministic, and the last click always wins.
 *
 * Leaflet also caches its container size and only refreshes it on *window* resize, so a
 * ResizeObserver covers the other cases — the panel stacking at a breakpoint, the embedded
 * section reflowing, the map mounting before layout settles.
 */
export default function FitBounds({ bbox, padding = 24 }: Props) {
  const map = useMap();
  const lastKey = useRef("");
  const bboxRef = useRef(bbox);
  /** View produced by the last fit; if the map still matches, the user hasn't moved it. */
  const fittedView = useRef<{ lat: number; lng: number; zoom: number } | null>(null);

  bboxRef.current = bbox;

  const fit = useCallback(
    (target: [number, number, number, number]) => {
      const [west, south, east, north] = target;
      map.stop(); // kill any in-flight movement before repositioning
      map.fitBounds(L.latLngBounds([south, west], [north, east]), {
        padding: [padding, padding],
        animate: false,
      });
      const c = map.getCenter();
      fittedView.current = { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
    },
    [map, padding],
  );

  /** True while the map still sits exactly where the last fit left it. */
  const isUntouched = useCallback(() => {
    const v = fittedView.current;
    if (!v) return false;
    const c = map.getCenter();
    return (
      map.getZoom() === v.zoom &&
      Math.abs(c.lat - v.lat) < 1e-6 &&
      Math.abs(c.lng - v.lng) < 1e-6
    );
  }, [map]);

  useEffect(() => {
    if (!bbox) return;
    const key = bbox.join(",");
    if (key === lastKey.current) return;
    lastKey.current = key;
    fit(bbox);
  }, [bbox, fit]);

  useEffect(() => {
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Check before invalidateSize, which can nudge the centre itself.
        const refit = bboxRef.current && isUntouched();
        map.invalidateSize({ animate: false });
        if (refit) fit(bboxRef.current!);
      });
    });

    observer.observe(map.getContainer());
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [map, fit, isUntouched]);

  return null;
}
