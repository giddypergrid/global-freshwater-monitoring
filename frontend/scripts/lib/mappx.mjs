/**
 * Turning a lat/lng into a screen pixel, for scripts that need to click a real place.
 *
 * Hardcoded pixel coordinates rot the moment a fit or a viewport changes, and a probe that
 * silently lands in the ocean reports a failure that is not there. This reads the zoom and
 * origin off a rendered tile's own URL, so it is correct wherever the map happens to sit.
 */

/** Screen pixel of a lat/lng, or null if no tile has loaded yet. */
export function screenPointFor(page, lng, lat) {
  return page.evaluate(
    ([lng, lat]) => {
      const tile = document.querySelector("img.leaflet-tile-loaded");
      if (!tile) return null;
      // Two tile URL shapes: {z}/{x}/{y}.png as CARTO and OpenStreetMap serve it, and
      // ArcGIS /tile/{z}/{y}/{x} with no extension, which is row before column.
      const arc = tile.src.match(/\/tile\/(\d+)\/(\d+)\/(\d+)(?:\?|$)/);
      const xyz = tile.src.match(/\/(\d+)\/(\d+)\/(\d+)(?:@2x)?\.png/);
      if (!arc && !xyz) return null;
      const [z, tx, ty] = arc
        ? [+arc[1], +arc[3], +arc[2]]
        : [+xyz[1], +xyz[2], +xyz[3]];
      const size = 256 * 2 ** z;
      const wx = ((lng + 180) / 360) * size;
      const rad = (lat * Math.PI) / 180;
      const wy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * size;
      const rect = tile.getBoundingClientRect();
      const scale = rect.width / 256;
      return {
        x: rect.left + (wx - tx * 256) * scale,
        y: rect.top + (wy - ty * 256) * scale,
        zoom: z,
      };
    },
    [lng, lat],
  );
}

/** Whether a point is inside the map pane, with a small margin off each edge. */
export async function isOnScreen(page, point, margin = 4) {
  if (!point) return false;
  const box = await page.locator(".leaflet-container").boundingBox();
  if (!box) return false;
  return (
    point.x > box.x + margin &&
    point.x < box.x + box.width - margin &&
    point.y > box.y + margin &&
    point.y < box.y + box.height - margin
  );
}

/** Both at once: the pixel, and whether clicking it would prove anything. */
export async function targetPoint(page, lng, lat) {
  const point = await screenPointFor(page, lng, lat);
  return { point, visible: await isOnScreen(page, point) };
}
