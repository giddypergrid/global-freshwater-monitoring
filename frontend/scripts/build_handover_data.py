# -*- coding: utf-8 -*-
"""Turn the Handover CSV/GeoJSON drop into the static files the tool fetches.

Run:  python scripts/build_handover_data.py

Partitioning follows WEBSITE_IMPLEMENTATION.md: the browser never receives the full
765,650-row lookup, only one (nutrient, frequency) slice at a time.
"""

import hashlib
import json
import math
import shutil
from pathlib import Path

import pandas as pd

HANDOVER = Path(r"C:\Users\PC\Desktop\River\Handover")
OUT = Path(__file__).resolve().parent.parent / "public" / "data"

# Coordinate precision: 5 dp is ~1 m, far finer than a 0.005 deg simplified outline.
SITE_DP = 5
POLY_DP = 3
SE_SIG = 4
# The source outline is already generalised to 0.005 deg. 0.02 deg (~2 km) is still far
# finer than the zoom levels this layer is drawn at, and cuts the payload ~4x.
SIMPLIFY_DEG = 0.008

NUTRIENTS = {"TN": "tn", "TP": "tp"}
FREQUENCY_SLUG = {
    "daily": "daily",
    "weekly": "weekly",
    "fortnightly": "fortnightly",
    "monthly": "monthly",
    "quarterly": "quarterly",
}


def round_sig(value: float, digits: int = SE_SIG) -> float:
    if value == 0 or not math.isfinite(value):
        return value
    return round(value, -int(math.floor(math.log10(abs(value)))) + (digits - 1))


def write_json(path: Path, payload) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, separators=(",", ":"), allow_nan=False)
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def load_sites() -> pd.DataFrame:
    return pd.read_csv(
        HANDOVER / "monitored_site_locations.csv",
        dtype={"HYBAS_ID": "string", "PFAF_ID": "string"},
    )


def load_catchments() -> pd.DataFrame:
    return pd.read_csv(
        HANDOVER / "monitored_catchments_summary.csv",
        dtype={"HYBAS_ID": "string", "NEXT_DOWN": "string",
               "MAIN_BAS": "string", "PFAF_ID": "string"},
    )


def none_if_nan(value):
    return None if pd.isna(value) else value


def build_site_files(sites: pd.DataFrame) -> dict:
    """One file per nutrient. Every display field the spec asks for travels with the point."""
    written = {}
    for parameter, slug in NUTRIENTS.items():
        rows = sites[sites.parameter == parameter]
        regions = sorted(rows.source_region.unique().tolist())
        region_index = {name: i for i, name in enumerate(regions)}
        methods = ["point_in_polygon", "nearest_polygon_within_5km",
                   "outside_hydrobasins_coverage"]

        records = []
        for r in rows.itertuples(index=False):
            # site_id is the half of site_parameter_id after "::", so it is not repeated.
            item = {
                "i": r.site_id,
                "y": round(r.latitude, SITE_DP),
                "x": round(r.longitude, SITE_DP),
                "r": region_index[r.source_region],
                "t": 0 if r.power_readiness_tier == "A_robust" else 1,
                "c": round_sig(r.current_modelled_annual_median_mg_L, 5),
                "n": int(r.n_positive_unique_dates),
                "f": r.model_first_date,
                "l": r.model_last_date,
            }
            if not pd.isna(r.HYBAS_ID):
                item["b"] = r.HYBAS_ID
            if r.basin_assignment_method != "point_in_polygon":
                item["m"] = methods.index(r.basin_assignment_method)
                item["d"] = round(r.basin_assignment_distance_km, 2)
            # The raw file usually starts and ends where the model does; only note exceptions.
            if r.metadata_start_date != r.model_first_date:
                item["F"] = r.metadata_start_date
            if r.metadata_end_date != r.model_last_date:
                item["L"] = r.metadata_end_date
            records.append(item)

        payload = {
            "parameter": parameter,
            "threshold": float(rows.threshold_mg_L.iloc[0]),
            "regions": regions,
            "tiers": ["A_robust", "B_moderate"],
            "methods": methods,
            "sites": records,
        }
        written[slug] = write_json(OUT / f"sites-{slug}.json", payload)
    return written


def build_power_files(sites: pd.DataFrame) -> tuple[dict, list, list]:
    """One file per nutrient x frequency: site_id -> [SE at each duration]."""
    lookup = pd.read_csv(
        HANDOVER / "monitored_site_slope_se_lookup.csv",
        dtype={"site_id": "string", "site_parameter_id": "string"},
    )
    durations = sorted(lookup.duration_years.unique().tolist())
    samples = (lookup.groupby("frequency").samples_per_year.first()
               .reindex(FREQUENCY_SLUG.keys()).to_dict())

    written = {}
    for parameter, nutrient_slug in NUTRIENTS.items():
        for frequency, freq_slug in FREQUENCY_SLUG.items():
            block = lookup[(lookup.parameter == parameter) & (lookup.frequency == frequency)]
            wide = (block.pivot(index="site_parameter_id", columns="duration_years",
                               values="slope_se_per_year")[durations])
            payload = {
                "durations": durations,
                "samplesPerYear": samples[frequency],
                "se": {idx: [round_sig(v) for v in row]
                       for idx, row in zip(wide.index, wide.to_numpy())},
            }
            path = OUT / "power" / f"{nutrient_slug}-{freq_slug}.json"
            written[f"{nutrient_slug}-{freq_slug}"] = write_json(path, payload)

    # planned_sample_count is round(years * samples_per_year) — recomputed in the browser.
    return written, durations, list(FREQUENCY_SLUG.keys())


def simplify_ring(ring: list, tolerance: float) -> list:
    """Ramer-Douglas-Peucker, iterative so deep rings cannot blow the stack."""
    if len(ring) < 5:
        return ring
    keep = [False] * len(ring)
    keep[0] = keep[-1] = True
    stack = [(0, len(ring) - 1)]

    while stack:
        first, last = stack.pop()
        if last <= first + 1:
            continue
        ax, ay = ring[first]
        bx, by = ring[last]
        dx, dy = bx - ax, by - ay
        span = dx * dx + dy * dy
        worst, at = -1.0, first

        for i in range(first + 1, last):
            px, py = ring[i]
            if span == 0:
                dist = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / span))
                qx, qy = ax + t * dx, ay + t * dy
                dist = (px - qx) ** 2 + (py - qy) ** 2
            if dist > worst:
                worst, at = dist, i

        if worst > tolerance * tolerance:
            keep[at] = True
            stack.append((first, at))
            stack.append((at, last))

    out = [point for point, flag in zip(ring, keep) if flag]
    return out if len(out) >= 4 else ring


def build_outlines(catchments: pd.DataFrame) -> int:
    """Polygons keep only what the map draws with; the rest is already in index.json."""
    source = json.loads((HANDOVER / "monitored_hydrobasins_level6.geojson").read_text(encoding="utf-8"))

    def thin(coords):
        if isinstance(coords[0], (int, float)):
            return [round(coords[0], POLY_DP), round(coords[1], POLY_DP)]
        if isinstance(coords[0][0], (int, float)):
            ring = simplify_ring([thin(c) for c in coords], SIMPLIFY_DEG)
            out = [ring[0]]
            for point in ring[1:]:
                if point != out[-1]:
                    out.append(point)
            # A ring needs 4 points to stay closed and non-degenerate.
            if len(out) < 4:
                return ring
            if out[0] != out[-1]:
                out.append(out[0])
            return out
        return [thin(c) for c in coords]

    features = []
    for feature in source["features"]:
        props = feature["properties"]
        features.append({
            "type": "Feature",
            "properties": {
                "id": props["HYBAS_ID"],
                "n": props["monitored_site_parameter_records"],
            },
            "geometry": {
                "type": feature["geometry"]["type"],
                "coordinates": thin(feature["geometry"]["coordinates"]),
            },
        })
    return write_json(OUT / "catchments.geojson",
                      {"type": "FeatureCollection", "features": features})


def bbox_of(geometry) -> list:
    xs, ys = [], []

    def visit(node):
        if isinstance(node[0], (int, float)):
            xs.append(node[0])
            ys.append(node[1])
        else:
            for child in node:
                visit(child)

    visit(geometry["coordinates"])
    return [round(min(xs), POLY_DP), round(min(ys), POLY_DP),
            round(max(xs), POLY_DP), round(max(ys), POLY_DP)]


def build_index(sites: pd.DataFrame, catchments: pd.DataFrame,
                durations: list, frequencies: list) -> int:
    source = json.loads((HANDOVER / "monitored_hydrobasins_level6.geojson").read_text(encoding="utf-8"))
    boxes = {f["properties"]["HYBAS_ID"]: bbox_of(f["geometry"]) for f in source["features"]}

    # HydroBASINS carries no names, so a catchment is grouped by where its sites came from.
    assigned = sites[sites.HYBAS_ID.notna()]
    dominant = (assigned.groupby(["HYBAS_ID", "source_region"]).size()
                .reset_index(name="n").sort_values("n", ascending=False)
                .drop_duplicates("HYBAS_ID").set_index("HYBAS_ID").source_region.to_dict())

    catchment_rows = []
    for r in catchments.itertuples(index=False):
        catchment_rows.append({
            "id": r.HYBAS_ID,
            "region": dominant.get(r.HYBAS_ID, "Unassigned"),
            "hydroRegion": r.hydrobasins_region,
            "bbox": boxes.get(r.HYBAS_ID),
            "records": int(r.monitored_site_parameter_records),
            "tn": int(r.tn_site_records),
            "tp": int(r.tp_site_records),
            "tierA": int(r.tier_a_records),
            "tierB": int(r.tier_b_records),
            "subArea": r.SUB_AREA_km2,
            "upArea": r.UP_AREA_km2,
            "nextDown": r.NEXT_DOWN,
            "mainBas": r.MAIN_BAS,
            "pfaf": r.PFAF_ID,
            "endo": int(r.ENDO),
            "coast": int(r.COAST),
            "order": int(r.ORDER),
            "medianTn": none_if_nan(round_sig(r.median_current_tn_mg_L, 6)),
            "medianTp": none_if_nan(round_sig(r.median_current_tp_mg_L, 6)),
        })

    region_rows = []
    for name, group in sites.groupby("source_region"):
        ids = set(group.HYBAS_ID.dropna())
        lat, lon = group.latitude, group.longitude
        region_rows.append({
            "name": name,
            "sites": int(len(group)),
            "catchments": len(ids),
            "bbox": [round(lon.min(), 3), round(lat.min(), 3),
                     round(lon.max(), 3), round(lat.max(), 3)],
        })
    region_rows.sort(key=lambda r: -r["sites"])

    unassigned = int(sites.HYBAS_ID.isna().sum())
    payload = {
        "generated": pd.Timestamp.utcnow().strftime("%Y-%m-%d"),
        "nutrients": [
            {"key": "tn", "parameter": "TN", "label": "Total nitrogen (TN)",
             "threshold": 0.8,
             "sites": int((sites.parameter == "TN").sum())},
            {"key": "tp", "parameter": "TP", "label": "Total phosphorus (TP)",
             "threshold": 0.045,
             "sites": int((sites.parameter == "TP").sum())},
        ],
        "frequencies": frequencies,
        "durations": durations,
        "alpha": 0.05,
        "targetPower": 0.8,
        "concentrationLabel": sites.current_concentration_display_label.iloc[0],
        "totals": {
            "records": int(len(sites)),
            "catchments": int(len(catchments)),
            "tierA": int((sites.power_readiness_tier == "A_robust").sum()),
            "tierB": int((sites.power_readiness_tier == "B_moderate").sum()),
            "unassignedSites": unassigned,
            "polygonsWorldwide": 16397,
        },
        "defaultRegion": region_rows[0]["name"],
        "regions": region_rows,
        "catchments": catchment_rows,
    }
    return write_json(OUT / "index.json", payload)


def write_version() -> str:
    """A content hash of everything served, so URLs change only when the data does.

    Cache-Control on /data/ is a year, so a stale URL would never be refetched. The hash
    is appended as ?v= by lib/data.ts.
    """
    digest = hashlib.sha256()
    for path in sorted(OUT.rglob("*")):
        if path.is_file():
            digest.update(path.name.encode())
            digest.update(path.read_bytes())
    version = digest.hexdigest()[:12]
    target = Path(__file__).resolve().parent.parent / "lib" / "data-version.ts"
    header = "/** Generated by scripts/build_handover_data.py. Do not edit. */"
    target.write_text(
        f'{header}\nexport const DATA_VERSION = "{version}";\n',
        encoding="utf-8",
    )
    return version


def main() -> None:
    for stale in ["catchments", "power"]:
        shutil.rmtree(OUT / stale, ignore_errors=True)
    for stale in OUT.glob("*.json"):
        stale.unlink()
    (OUT / "catchments.geojson").unlink(missing_ok=True)

    sites = load_sites()
    catchments = load_catchments()

    site_bytes = build_site_files(sites)
    power_bytes, durations, frequencies = build_power_files(sites)
    outline_bytes = build_outlines(catchments)
    index_bytes = build_index(sites, catchments, durations, frequencies)

    mb = lambda n: f"{n / 1_000_000:.2f} MB"
    print("index.json           ", mb(index_bytes))
    print("catchments.geojson   ", mb(outline_bytes))
    for slug, size in site_bytes.items():
        print(f"sites-{slug}.json         ", mb(size))
    print("power/ (10 files)    ", mb(sum(power_bytes.values())),
          "  largest", mb(max(power_bytes.values())))
    print("data version         ", write_version())


if __name__ == "__main__":
    main()
