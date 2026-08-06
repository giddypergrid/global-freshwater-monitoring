#!/usr/bin/env python3
"""
Build the static data files the web app serves.

Run once; output lands in public/data/ and is committed. Nothing is computed at
request time — the browser fetches these files directly (no backend).

Geometry is REAL:
  HydroBASINS v1c lev06   -> catchment outlines (dissolved by MAIN_BAS = one river system)
  HydroRIVERS v1.0        -> river reaches, filtered by Strahler order
  Natural Earth 110m      -> country outlines

Water-quality variability is SYNTHETIC: each reach gets a coefficient of
variation per indicator, generated from smooth spatial noise so neighbouring
reaches resemble each other the way real monitoring data does. Detection power
itself is not stored — the browser computes it from these CVs.

Usage:
    python scripts/build_data.py --source <dir-with-extracted-shapefiles> \
                                 --countries <ne_110m_admin_0_countries.geojson>
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path

import shapefile
from shapely.geometry import Point, shape
from shapely.ops import unary_union
from shapely.prepared import prep

# --- what we ship -----------------------------------------------------------

# seed = a point known to sit inside the river system; we look up which lev06
# polygon contains it, then dissolve every polygon sharing its MAIN_BAS.
#
# `published` is the basin area quoted in the literature. It is not used to build
# anything — it is the check that the seed resolved to the river system we meant.
# HydroBASINS lev06 merges neighbouring small coastal rivers into one unit, so an
# unchecked seed happily returns a real polygon under the wrong name (Rakaia and
# Rangitata both resolve to the same 18,181 km2 Canterbury coastal unit).
CATCHMENTS = [
    # id                 name              country          region seed(lon, lat)       published
    ("waikato",          "Waikato",        "New Zealand",   "au", (175.28, -37.79),     14_260),
    ("clutha",           "Clutha",         "New Zealand",   "au", (169.40, -45.25),     21_960),
    ("waitaki",          "Waitaki",        "New Zealand",   "au", (170.50, -44.65),     11_970),
    ("manawatu",         "Manawatu",       "New Zealand",   "au", (175.55, -40.35),      5_900),
    ("whanganui",        "Whanganui",      "New Zealand",   "au", (175.20, -39.20),      7_120),
    ("rangitikei",       "Rangitikei",     "New Zealand",   "au", (175.78, -39.90),      3_980),
    ("wairau",           "Wairau",         "New Zealand",   "au", (173.55, -41.63),      4_180),

    ("murray-darling",   "Murray-Darling", "Australia",     "au", (143.55, -34.74),  1_059_000),
    ("fitzroy-qld",      "Fitzroy",        "Australia",     "au", (150.50, -23.40),    142_665),
    ("burdekin",         "Burdekin",       "Australia",     "au", (146.80, -20.30),    130_120),
    ("swan-avon",        "Swan-Avon",      "Australia",     "au", (116.80, -31.80),    124_000),

    ("mississippi",      "Mississippi",    "United States", "na", (-90.20, 38.63),   3_220_000),
    ("colorado",         "Colorado",       "United States", "na", (-112.10, 36.10),    640_000),
    ("columbia",         "Columbia",       "United States", "na", (-119.60, 46.20),    668_000),
    ("sacramento",       "Sacramento",     "United States", "na", (-121.55, 38.50),    154_000),

    ("amazon",           "Amazon",         "Brazil",        "sa", (-60.02, -3.13),   5_956_000),
    ("sao-francisco",    "Sao Francisco",  "Brazil",        "sa", (-43.42, -13.25),    641_000),
    ("tocantins",        "Tocantins",      "Brazil",        "sa", (-49.13, -5.37),     764_183),
    ("parana",           "Parana",         "Brazil",        "sa", (-52.11, -21.76), 2_582_672),

    ("yangtze",          "Yangtze",        "China",         "as", (114.30, 30.58),   1_808_500),
    # seed at the Sanmenxia gorge, not the lower course: HydroSHEDS cannot resolve
    # the perched lower Yellow River from the DEM and routes it into the Yangtze.
    ("yellow-river",     "Yellow River",   "China",         "as", (111.35, 34.82),     795_000),
    ("pearl",            "Pearl",          "China",         "as", (111.32, 23.48),     453_690),
    # the Songhua drains into the Amur, so the dissolved system is the whole basin
    ("amur-songhua",     "Amur-Songhua",   "China",         "as", (126.53, 45.80),   1_855_000),

    ("rhine",            "Rhine",          "Germany",       "eu", (8.27, 50.00),       185_000),
    ("danube",           "Danube",         "Germany",       "eu", (12.10, 49.02),      801_463),
    ("elbe",             "Elbe",           "Germany",       "eu", (13.74, 51.05),      148_268),
    ("weser",            "Weser",          "Germany",       "eu", (9.47, 52.90),        46_306),
]

# extracted/published ratio outside this range means the seed found the wrong system
AREA_TOLERANCE = (0.80, 1.30)

DEFAULT_COUNTRY = "New Zealand"

# Natural Earth spells some of these differently to our display names
NE_COUNTRY_NAMES = {
    "New Zealand": "New Zealand",
    "Australia": "Australia",
    "United States": "United States of America",
    "Brazil": "Brazil",
    "China": "China",
    "Germany": "Germany",
}

# indicator key -> label + baseline coefficient of variation of the monitored series
INDICATORS = {
    "tn": ("Total nitrogen", 0.35),
    "tp": ("Total phosphorus", 0.55),
    "ecoli": ("E. coli", 1.10),
    "sediment": ("Suspended sediment", 0.85),
}

MAX_REACHES = 3000   # per catchment, keeps each file small enough to fetch fast
MIN_ORDER = 3        # never draw below 3rd order — mirrors the NZ app's rule
SITES_PER_CATCHMENT = 45
COORD_DP = 4         # ~11 m, finer than HydroRIVERS' own 15 arc-second vertices


# --- smooth spatial noise ---------------------------------------------------
# Value noise on a lat/lon grid: neighbouring reaches land in the same cell or
# adjacent ones, so the generated variability forms patches rather than static.

def _hash01(xi: int, yi: int, salt: int) -> float:
    h = (xi * 374761393 + yi * 668265263 + salt * 2147483647) & 0xFFFFFFFF
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFFFF) / 0xFFFFFF


def value_noise(lon: float, lat: float, cell: float, salt: int) -> float:
    """Bilinearly interpolated noise in [0,1]; `cell` is the patch size in degrees."""
    x, y = lon / cell, lat / cell
    xi, yi = math.floor(x), math.floor(y)
    fx, fy = x - xi, y - yi
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)  # smoothstep
    n00 = _hash01(xi, yi, salt)
    n10 = _hash01(xi + 1, yi, salt)
    n01 = _hash01(xi, yi + 1, salt)
    n11 = _hash01(xi + 1, yi + 1, salt)
    return (n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy


def reach_cv(key: str, base: float, lon: float, lat: float, order: int) -> float:
    """Coefficient of variation for one reach and one indicator."""
    salt = sum(ord(c) for c in key)
    broad = value_noise(lon, lat, 4.0, salt)        # regional character
    local = value_noise(lon, lat, 0.6, salt + 77)   # sub-catchment texture
    factor = 0.55 + 1.15 * (0.7 * broad + 0.3 * local)
    headwater = 1.0 + 0.16 * max(0, 6 - order)      # small streams are noisier
    return round(base * factor * headwater, 3)


# --- geometry helpers -------------------------------------------------------

def round_coords(obj):
    if isinstance(obj, (list, tuple)):
        if obj and isinstance(obj[0], (int, float)):
            return [round(float(c), COORD_DP) for c in obj[:2]]
        return [round_coords(o) for o in obj]
    return obj


def feature(geom, props: dict) -> dict:
    return {"type": "Feature", "properties": props, "geometry": geom}


def to_geojson(features: list) -> dict:
    return {"type": "FeatureCollection", "features": features}


def simplified_geom(geometry, tolerance: float) -> dict:
    gj = geometry.simplify(tolerance, preserve_topology=True).__geo_interface__
    return {"type": gj["type"], "coordinates": round_coords(gj["coordinates"])}


# --- extraction -------------------------------------------------------------

def resolve_outlines(src: Path, region: str, seeds: list):
    """Dissolve each seed's whole river system out of the region's lev06 polygons."""
    reader = shapefile.Reader(str(src / f"hybas_{region}_lev06_v1c"))
    records = reader.records()
    geoms = [shape(s.__geo_interface__) for s in reader.shapes()]

    by_main = defaultdict(list)
    for i, rec in enumerate(records):
        by_main[rec["MAIN_BAS"]].append(i)

    resolved = {}
    for catchment_id, name, country, _, (lon, lat), published in seeds:
        point = Point(lon, lat)
        hit = None
        for i, g in enumerate(geoms):
            minx, miny, maxx, maxy = g.bounds
            if minx <= lon <= maxx and miny <= lat <= maxy and g.contains(point):
                hit = i
                break
        if hit is None:
            raise SystemExit(f"{name}: seed {(lon, lat)} fell outside every {region} lev06 polygon")

        members = by_main[records[hit]["MAIN_BAS"]]
        outline = unary_union([geoms[i] for i in members])
        area = sum(records[i]["SUB_AREA"] for i in members)

        ratio = area / published
        if not AREA_TOLERANCE[0] <= ratio <= AREA_TOLERANCE[1]:
            raise SystemExit(
                f"{name}: seed resolved to {area:,.0f} km2 but the published area is "
                f"{published:,} km2 (ratio {ratio:.2f}). The seed is in the wrong river system."
            )

        resolved[catchment_id] = {
            "id": catchment_id, "name": name, "country": country,
            "outline": outline, "prepared": prep(outline),
            "areaKm2": round(area), "areaPublishedKm2": published,
            "subBasins": len(members),
        }
        print(f"    {name:16} {area:>12,.0f} km2  vs published {published:>11,}  "
              f"ratio {ratio:.2f}  ({len(members)} sub-basins)", flush=True)
    return resolved


def assign_reaches(src: Path, region: str, resolved: dict):
    """One pass over the region's rivers, bucketing each reach into its catchment.

    Only lightweight attributes are kept here; the geometry is re-read by index
    afterwards for the reaches that actually survive the per-catchment cap.
    """
    reader = shapefile.Reader(str(src / f"HydroRIVERS_v10_{region}_shp" / f"HydroRIVERS_v10_{region}"))
    targets = [(c["id"], *c["outline"].bounds, c["prepared"]) for c in resolved.values()]
    buckets = defaultdict(list)

    for idx, (rec, shp) in enumerate(zip(reader.records(), reader.iterShapes())):
        order = rec["ORD_STRA"]
        if order < MIN_ORDER:
            continue
        pts = shp.points
        mx, my = pts[len(pts) // 2]
        for catchment_id, minx, miny, maxx, maxy, prepared in targets:
            if not (minx <= mx <= maxx and miny <= my <= maxy):
                continue
            if not prepared.contains(Point(mx, my)):
                continue
            buckets[catchment_id].append((idx, order, rec["UPLAND_SKM"], rec["LENGTH_KM"],
                                          rec["DIS_AV_CMS"], rec["HYRIV_ID"], mx, my))
            break
    return reader, buckets


def build_catchment(meta: dict, reader, rows: list, out_dir: Path):
    # keep the biggest rivers first, then fill downward until the cap is reached
    rows.sort(key=lambda r: (-r[1], -r[2]))
    rows = rows[:MAX_REACHES]

    features = []
    for idx, order, upland, length, discharge, hyriv_id, mx, my in rows:
        cvs = {k: reach_cv(k, base, mx, my, order) for k, (_, base) in INDICATORS.items()}
        features.append(feature(
            {"type": "LineString", "coordinates": round_coords(reader.shape(idx).points)},
            {"id": hyriv_id, "ord": order, "len": round(length, 2),
             "dis": round(discharge, 3), "up": round(upland, 1), "cv": cvs},
        ))

    # monitoring sites: spread the largest reaches out so the dots don't clump.
    # spacing scales with the catchment, else small catchments yield only a few.
    minx, miny, maxx, maxy = meta["outline"].bounds
    spacing = max(maxx - minx, maxy - miny) / 18
    sites, used = [], []
    for f in sorted(features, key=lambda f: -f["properties"]["up"]):
        if len(sites) >= SITES_PER_CATCHMENT:
            break
        coords = f["geometry"]["coordinates"]
        lon, lat = coords[len(coords) // 2]
        if any(abs(lon - ul) < spacing and abs(lat - ub) < spacing for ul, ub in used):
            continue
        used.append((lon, lat))
        sites.append(feature(
            {"type": "Point", "coordinates": [lon, lat]},
            {"id": f["properties"]["id"],
             "name": f"{meta['id'][:3].upper()}-{len(sites) + 1:03d}",
             "ord": f["properties"]["ord"], "cv": f["properties"]["cv"]},
        ))

    bbox = [round(v, 4) for v in meta["outline"].bounds]
    payload = {
        "id": meta["id"], "name": meta["name"], "country": meta["country"],
        "areaKm2": meta["areaKm2"], "areaPublishedKm2": meta["areaPublishedKm2"],
        "subBasins": meta["subBasins"], "bbox": bbox,
        "minOrder": min(f["properties"]["ord"] for f in features),
        "reaches": to_geojson(features), "sites": to_geojson(sites),
    }
    (out_dir / "catchments" / f"{meta['id']}.json").write_text(json.dumps(payload), encoding="utf-8")

    return {
        "id": meta["id"], "name": meta["name"], "country": meta["country"],
        "areaKm2": meta["areaKm2"], "areaPublishedKm2": meta["areaPublishedKm2"],
        "subBasins": meta["subBasins"], "bbox": bbox,
        "reachCount": len(features), "siteCount": len(sites), "minOrder": payload["minOrder"],
    }


def build_countries(ne_path: Path):
    data = json.loads(ne_path.read_text(encoding="utf-8"))
    wanted = {ne: display for display, ne in NE_COUNTRY_NAMES.items()}
    features = []
    for f in data["features"]:
        nm = f["properties"].get("NAME") or f["properties"].get("ADMIN")
        if nm in wanted:
            features.append(feature(
                {"type": f["geometry"]["type"], "coordinates": round_coords(f["geometry"]["coordinates"])},
                {"name": wanted[nm]},
            ))
    return to_geojson(features)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, help="dir holding extracted HydroBASINS/HydroRIVERS shapefiles")
    ap.add_argument("--countries", required=True, help="Natural Earth ne_110m_admin_0_countries.geojson")
    ap.add_argument("--out", default="public/data")
    args = ap.parse_args()

    src = Path(args.source)
    out_dir = Path(args.out)
    # clear stale files but keep the directories: Windows locks a dir any shell sits in
    for stale in out_dir.rglob("*"):
        if stale.is_file():
            stale.unlink()
    (out_dir / "catchments").mkdir(parents=True, exist_ok=True)

    by_region = defaultdict(list)
    for entry in CATCHMENTS:
        by_region[entry[3]].append(entry)

    index, outlines = [], []
    for region, seeds in by_region.items():
        print(f"[{region}] resolving {len(seeds)} catchments", flush=True)
        resolved = resolve_outlines(src, region, seeds)

        print(f"[{region}] scanning rivers", flush=True)
        reader, buckets = assign_reaches(src, region, resolved)

        for catchment_id, meta in resolved.items():
            rows = buckets.get(catchment_id, [])
            if not rows:
                raise SystemExit(f"{meta['name']}: no reaches found inside the outline")
            entry = build_catchment(meta, reader, rows, out_dir)
            index.append(entry)
            tol = 0.02 if entry["areaKm2"] > 500_000 else 0.005
            outlines.append(feature(
                simplified_geom(meta["outline"], tol),
                {"id": entry["id"], "name": entry["name"], "country": entry["country"]},
            ))
            print(f"    {entry['name']:16} {entry['reachCount']:>4} reaches, "
                  f"{entry['siteCount']:>2} sites, order >= {entry['minOrder']}", flush=True)

    index.sort(key=lambda e: (e["country"] != DEFAULT_COUNTRY, e["country"], e["name"]))
    countries = []
    for country in dict.fromkeys(e["country"] for e in index):
        members = [e for e in index if e["country"] == country]
        lons = [c for e in members for c in (e["bbox"][0], e["bbox"][2])]
        lats = [c for e in members for c in (e["bbox"][1], e["bbox"][3])]
        countries.append({
            "name": country,
            "bbox": [min(lons), min(lats), max(lons), max(lats)],
            "catchmentCount": len(members),
        })

    (out_dir / "catchments.geojson").write_text(json.dumps(to_geojson(outlines)), encoding="utf-8")
    (out_dir / "countries.geojson").write_text(json.dumps(build_countries(Path(args.countries))), encoding="utf-8")
    (out_dir / "index.json").write_text(json.dumps({
        "defaultCountry": DEFAULT_COUNTRY,
        "indicators": [{"key": k, "label": label} for k, (label, _) in INDICATORS.items()],
        "countries": countries,
        "catchments": index,
    }, indent=2), encoding="utf-8")

    print(f"\nwrote {len(index)} catchments to {out_dir.resolve()}")


if __name__ == "__main__":
    main()
