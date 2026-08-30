"""Clip HydroRIVERS to the monitored catchments and shard it one file per catchment.

The handover has no river geometry. This script adds it from HydroRIVERS v1.0, which is
built on the same HydroSHEDS grid as the HydroBASINS polygons already in the handover, so
the reaches line up with the catchment boundaries without reprojection.

The power calculation is untouched by this script. The reaches are drawn as context only,
because power has not been extrapolated from monitored sites to river reaches yet.

Input:
  HydroRIVERS_v10_<region>_shp/  one directory per HydroSHEDS region, from
  https://www.hydrosheds.org/products/hydrorivers (free, attribution required).

Output:
  public/data/rivers/<HYBAS_ID>.json   one shard per catchment
  public/data/rivers/index.json        which catchments have a shard, and how big

Run:
  python scripts/build_river_network.py --rivers <dir with the unzipped region folders>
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import shapefile
from shapely import prepare
from shapely.geometry import box, shape
from shapely.strtree import STRtree

# 4 decimal places is about 11 m at the equator, well under the 15 arc-second (~500 m)
# resolution HydroRIVERS was derived at.
COORD_DP = 4

# Point budget per catchment. A shard is a faint background layer, not the subject of the
# map, so it is capped rather than allowed to run to half a megabyte in the big basins.
MAX_POINTS = 6000

# Strahler order is the only thinning lever HydroRIVERS gives that is stable across
# catchments: drop the smallest headwater streams first, keep the main stems.
MAX_ORDER = 9

HANDOVER_CATCHMENTS = "monitored_hydrobasins_level6.geojson"


def load_catchments(handover_dir: Path) -> dict[str, list[tuple[str, object]]]:
    """Monitored catchment polygons, grouped by their HydroSHEDS region code."""
    path = handover_dir / HANDOVER_CATCHMENTS
    with path.open(encoding="utf-8") as handle:
        collection = json.load(handle)

    by_region: dict[str, list[tuple[str, object]]] = defaultdict(list)
    for feature in collection["features"]:
        props = feature["properties"]
        by_region[props["hydrobasins_region"]].append(
            (str(props["HYBAS_ID"]), shape(feature["geometry"]))
        )
    return by_region


def clip_region(shp_stem: Path, catchments: list[tuple[str, object]]) -> dict[str, list]:
    """Return {hybas_id: [(strahler_order, [(lon, lat), ...]), ...]} for one region."""
    ids = [hybas_id for hybas_id, _ in catchments]
    geoms = [geom for _, geom in catchments]
    tree = STRtree(geoms)
    for geom in geoms:
        prepare(geom)

    reader = shapefile.Reader(str(shp_stem))
    field_names = [field[0] for field in reader.fields[1:]]
    order_at = field_names.index("ORD_STRA")

    found: dict[str, list] = defaultdict(list)
    for record in reader.iterShapeRecords():
        candidates = tree.query(box(*record.shape.bbox))
        if len(candidates) == 0:
            continue
        line = shape(record.shape.__geo_interface__)
        for position in candidates:
            if not geoms[position].intersects(line):
                continue
            found[ids[position]].append((record.record[order_at], record.shape.points))
            # One catchment per reach. A reach crossing a boundary is drawn in whichever
            # monitored catchment matched first; both would double the stored geometry.
            break
    reader.close()
    return found


def round_line(points: list[tuple[float, float]]) -> list[float]:
    """Flatten to [lon, lat, lon, lat, ...], rounded, with repeated points dropped."""
    flat: list[float] = []
    last: tuple[float, float] | None = None
    for lon, lat in points:
        pair = (round(lon, COORD_DP), round(lat, COORD_DP))
        if pair == last:
            continue
        flat.extend(pair)
        last = pair
    return flat


def pick_min_order(reaches: list[tuple[int, list]]) -> int:
    """Smallest Strahler order whose reaches still fit the per-catchment point budget."""
    points_at = defaultdict(int)
    for order, points in reaches:
        points_at[order] += len(points)

    for threshold in range(1, MAX_ORDER + 1):
        total = sum(count for order, count in points_at.items() if order >= threshold)
        if total <= MAX_POINTS:
            return threshold
    return MAX_ORDER


def build_shard(reaches: list[tuple[int, list]]) -> dict:
    """One catchment's drawable reaches, thinned to the point budget."""
    min_order = pick_min_order(reaches)
    kept = [
        [order, round_line(points)] for order, points in reaches if order >= min_order
    ]
    kept.sort(key=lambda reach: -reach[0])
    return {
        "minOrder": min_order,
        "reaches": len(kept),
        # `r` is [strahler_order, [lon, lat, lon, lat, ...]] to keep the file small.
        "r": kept,
    }


def main() -> None:
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--rivers",
        type=Path,
        required=True,
        help="directory holding the unzipped HydroRIVERS_v10_<region>_shp folders",
    )
    parser.add_argument("--handover", type=Path, default=here.parents[2] / "Handover")
    parser.add_argument("--out", type=Path, default=here.parent / "public" / "data" / "rivers")
    args = parser.parse_args()

    by_region = load_catchments(args.handover)
    args.out.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, dict] = {}
    for region in sorted(by_region):
        stem = args.rivers / f"HydroRIVERS_v10_{region}_shp" / f"HydroRIVERS_v10_{region}"
        if not stem.with_suffix(".shp").exists():
            print(f"{region}: no shapefile at {stem}.shp, skipped")
            continue

        catchments = by_region[region]
        found = clip_region(stem, catchments)
        written = 0
        for hybas_id, reaches in found.items():
            shard = build_shard(reaches)
            path = args.out / f"{hybas_id}.json"
            path.write_text(json.dumps(shard, separators=(",", ":")), encoding="utf-8")
            manifest[hybas_id] = {
                "reaches": shard["reaches"],
                "minOrder": shard["minOrder"],
                "bytes": path.stat().st_size,
            }
            written += 1
        print(
            f"{region}: {len(catchments)} catchments, {written} with reaches, "
            f"{sum(len(v) for v in found.values())} reaches matched"
        )

    index_path = args.out / "index.json"
    index_path.write_text(
        json.dumps(
            {
                "source": "HydroRIVERS v1.0 (HydroSHEDS)",
                "attribution": "HydroSHEDS/HydroRIVERS, WWF",
                "maxPointsPerCatchment": MAX_POINTS,
                "coordinateDecimals": COORD_DP,
                "catchments": manifest,
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )

    total = sum(entry["bytes"] for entry in manifest.values())
    print(
        f"\n{len(manifest)} shards, {total / 1e6:.1f} MB total, "
        f"largest {max((e['bytes'] for e in manifest.values()), default=0) / 1e3:.0f} kB, "
        f"index {index_path.stat().st_size / 1e3:.0f} kB"
    )


if __name__ == "__main__":
    main()
