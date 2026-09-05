"use client";

import { useEffect } from "react";
import { useMap } from "react-leaflet";
import type { LatLngBounds } from "leaflet";

interface Props {
  onChange: (bounds: LatLngBounds) => void;
}

/**
 * A margin of one viewport on every side, so a short pan lands on sites that were already
 * resolved instead of on a blank strip waiting for the next `moveend`.
 */
const BUFFER = 1;

/**
 * Reports the visible bounds so the power maths can be scoped to them. It fires on
 * `moveend`, not on `move`: a drag emits `move` on every pointer sample, and recomputing
 * that often costs far more than the whole-world pass it replaces. A zoom also ends in
 * `moveend`, so the one event covers both.
 */
export default function ViewportWatcher({ onChange }: Props) {
  const map = useMap();

  useEffect(() => {
    const report = () => onChange(map.getBounds().pad(BUFFER));

    report();
    map.on("moveend", report);
    return () => {
      map.off("moveend", report);
    };
  }, [map, onChange]);

  return null;
}
