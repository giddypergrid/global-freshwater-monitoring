"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

interface Props {
  bbox: [number, number, number, number] | null;
  padding?: number;
}

/** Long enough to read as movement, short enough not to hold up the next click. */
const FLY_SECONDS = 0.6;

/**
 * Keeps the map framed on the current bbox, flying rather than jumping so the drill-down
 * shows where it landed. Every fit calls `map.stop()` first, so clicking faster than the
 * flight cancels it outright instead of leaving the view drifting between two targets.
 *
 * Leaflet caches its container size and only refreshes it on *window* resize, so a
 * ResizeObserver covers the other cases: the panel stacking at a breakpoint, the embedded
 * section reflowing, the map mounting before layout settles.
 */
export default function FitBounds({ bbox, padding = 24 }: Props) {
  const map = useMap();
  const lastKey = useRef("");
  const bboxRef = useRef(bbox);
  /** View produced by the last fit; if the map still matches, the user hasn't moved it. */
  const fittedView = useRef<{ lat: number; lng: number; zoom: number } | null>(null);
  /** The flight is still in the air, so the current centre is not yet the fitted one. */
  const flying = useRef(false);

  useEffect(() => {
    bboxRef.current = bbox;
  }, [bbox]);

  const fit = useCallback(
    (target: [number, number, number, number], animate: boolean) => {
      const [west, south, east, north] = target;
      map.stop(); // kill any in-flight movement before repositioning
      flying.current = animate;
      const bounds = L.latLngBounds([south, west], [north, east]);
      const options = { padding: [padding, padding] as [number, number] };
      if (animate) map.flyToBounds(bounds, { ...options, duration: FLY_SECONDS });
      else map.fitBounds(bounds, { ...options, animate: false });
      if (!animate) {
        const centre = map.getCenter();
        fittedView.current = { lat: centre.lat, lng: centre.lng, zoom: map.getZoom() };
      }
    },
    [map, padding],
  );

  /** True while the map still sits exactly where the last fit left it. */
  const isUntouched = useCallback(() => {
    const view = fittedView.current;
    if (!view || flying.current) return false;
    const centre = map.getCenter();
    return (
      map.getZoom() === view.zoom &&
      Math.abs(centre.lat - view.lat) < 1e-6 &&
      Math.abs(centre.lng - view.lng) < 1e-6
    );
  }, [map]);

  // The flight's own end is the only point at which the resting view is known.
  useEffect(() => {
    function onMoveEnd() {
      if (!flying.current) return;
      flying.current = false;
      const centre = map.getCenter();
      fittedView.current = { lat: centre.lat, lng: centre.lng, zoom: map.getZoom() };
    }
    map.on("moveend", onMoveEnd);
    return () => {
      map.off("moveend", onMoveEnd);
    };
  }, [map]);

  useEffect(() => {
    if (!bbox) return;
    const key = bbox.join(",");
    const first = lastKey.current === "";
    if (key === lastKey.current) return;
    lastKey.current = key;
    // The opening view has nowhere to fly from, so it is placed directly.
    fit(bbox, !first);
  }, [bbox, fit]);

  useEffect(() => {
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        // Check before invalidateSize, which can nudge the centre itself.
        const refit = bboxRef.current && isUntouched();
        map.invalidateSize({ animate: false });
        if (refit) fit(bboxRef.current!, false);
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
