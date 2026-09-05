import type { LatLngBounds } from "leaflet";

/**
 * A latitude/longitude test that reads the four edges once and then compares numbers.
 *
 * Leaflet's own `bounds.contains([lat, lon])` builds a LatLng object per call. Across the
 * 11,224 phosphorus sites that measured 3.3 ms against 0.3 ms for the plain comparison, in
 * the production build on 4 Sep 2026, for the same 308 matches. The site list is filtered
 * on every map settle, so the allocation was a fixed cost at every zoom, including close
 * ones where only a few dozen sites are anywhere near the screen.
 *
 * The map is locked to a single world by `maxBounds` and `noWrap`, so the bounds never
 * cross the antimeridian and a straight comparison is safe here.
 */
export function withinBounds(bounds: LatLngBounds) {
  const south = bounds.getSouth();
  const north = bounds.getNorth();
  const west = bounds.getWest();
  const east = bounds.getEast();

  return (lat: number, lon: number) =>
    lat >= south && lat <= north && lon >= west && lon <= east;
}
