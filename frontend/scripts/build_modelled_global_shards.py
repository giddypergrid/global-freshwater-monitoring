from pathlib import Path
import gzip
import importlib.util
import json
import math
import shutil
import sys

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio
from shapely.geometry import mapping

ROOT = Path(r"F:\Data\GlobalPowerModel")
PUB = ROOT / "Publication"

REPO = Path.cwd()
OUT = REPO / "frontend" / "public" / "data" / "modelled"

POWER_FILE = (
    PUB / "data" / "frozen_inputs" / "unmonitored" /
    "level10_current_power_parameters_release_v1.parquet"
)

CLASS_FILE = (
    PUB / "data" / "derived" / "isotonic" /
    "unmonitored_current_classes_isotonic.parquet"
)

POWER_SCRIPT = (
    PUB / "code" / "reporting" /
    "create_isotonic_unmonitored_class_transition_release.py"
)

HYBAS_ZIP = PUB / "data" / "gis" / "hybas_level10.zip"

SIMPLIFY_TOLERANCE = 0.005
TILE_DEGREES = 5
MAX_PER_SHARD = 1000

YEARS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50]

SCHEDULES = {
    "m": 12.0,
    "f": 26.0,
    "w": 52.0,
    "t": 104.0,
}

MULT_COLS = [
    f"monthly_sd_multiplier_m{m:02d}_q50"
    for m in range(1, 13)
]


def gzip_bytes(data: bytes) -> int:
    return len(gzip.compress(data, compresslevel=9))


def load_power_module():
    spec = importlib.util.spec_from_file_location(
        "released_power_module",
        POWER_SCRIPT,
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules["released_power_module"] = module
    spec.loader.exec_module(module)
    return module


def hydro_region_from_layer(layer_name: str) -> str:
    # e.g. hybas_eu_lev10_v1c -> eu
    parts = layer_name.split("_")
    if len(parts) < 2:
        raise ValueError(f"Unexpected HydroBASINS layer name: {layer_name}")
    return parts[1]


def make_shard_name(
    region: str,
    tile_x: int,
    tile_y: int,
    part: int,
) -> str:
    return f"{region}-{tile_x:02d}-{tile_y:02d}-{part:03d}.json"


print("=" * 80)
print("BUILD FULL MODELLED LEVEL-10 WEBSITE DATASET")
print("=" * 80)

if not (REPO / "frontend").exists():
    raise RuntimeError(
        "Run this script from the global-freshwater-monitoring repo root."
    )

for path in [POWER_FILE, CLASS_FILE, POWER_SCRIPT, HYBAS_ZIP]:
    if not path.exists():
        raise FileNotFoundError(path)

released = load_power_module()

if OUT.exists():
    print(f"\nRemoving previous output folder:\n{OUT}")
    shutil.rmtree(OUT)

OUT.mkdir(parents=True, exist_ok=True)

print("\n1. Loading final eligible Level-10 catchments...")

classes = pd.read_parquet(CLASS_FILE)

classes["lev10_HYBAS_ID"] = pd.to_numeric(
    classes["lev10_HYBAS_ID"],
    errors="raise",
).astype("int64")

classes = classes.drop_duplicates("lev10_HYBAS_ID")

print(f"Eligible catchments: {len(classes):,}")

if len(classes) != 618553:
    raise RuntimeError(
        f"Expected 618,553 eligible catchments, found {len(classes):,}"
    )

eligible_ids = set(classes["lev10_HYBAS_ID"].tolist())

print("\n2. Loading Level-10 coordinates...")

coords = pd.read_parquet(
    POWER_FILE,
    columns=[
        "lev10_HYBAS_ID",
        "parameter",
        "latitude",
        "longitude",
    ],
)

coords["lev10_HYBAS_ID"] = pd.to_numeric(
    coords["lev10_HYBAS_ID"],
    errors="raise",
).astype("int64")

coords = (
    coords[coords["parameter"].eq("TN")]
    [["lev10_HYBAS_ID", "latitude", "longitude"]]
    .drop_duplicates("lev10_HYBAS_ID")
)

domain = classes.merge(
    coords,
    on="lev10_HYBAS_ID",
    how="inner",
    validate="one_to_one",
)

print(f"Eligible catchments with coordinates: {len(domain):,}")

if len(domain) != len(classes):
    raise RuntimeError(
        "Some eligible catchments are missing coordinates."
    )

domain["tile_x"] = np.floor(
    (domain["longitude"] + 180.0) / TILE_DEGREES
).astype(int)

domain["tile_y"] = np.floor(
    (domain["latitude"] + 90.0) / TILE_DEGREES
).astype(int)

print("\n3. Loading TN/TP q50 power parameters...")

power = pd.read_parquet(
    POWER_FILE,
    columns=[
        "lev10_HYBAS_ID",
        "parameter",
        "current_concentration_mg_L_q50",
        "residual_sd_q50",
        "monthly_rho_q50",
        *MULT_COLS,
    ],
)

power["lev10_HYBAS_ID"] = pd.to_numeric(
    power["lev10_HYBAS_ID"],
    errors="raise",
).astype("int64")

power = power[
    power["lev10_HYBAS_ID"].isin(eligible_ids)
].copy()

expected_rows = len(domain) * 2

print(f"TN/TP parameter rows: {len(power):,}")
print(f"Expected parameter rows: {expected_rows:,}")

if len(power) != expected_rows:
    raise RuntimeError(
        f"Expected {expected_rows:,} TN/TP rows, found {len(power):,}"
    )

print("\n4. Calculating released slope-SE arrays...")

se_lookup = {}

for parameter in ["TN", "TP"]:
    block = (
        power[power["parameter"].eq(parameter)]
        .sort_values("lev10_HYBAS_ID")
        .reset_index(drop=True)
    )

    ids = block["lev10_HYBAS_ID"].to_numpy(dtype=np.int64)
    sigma = block["residual_sd_q50"].to_numpy(float)
    rho = block["monthly_rho_q50"].to_numpy(float)
    multipliers = block[MULT_COLS].to_numpy(float)

    for freq_key, samples_per_year in SCHEDULES.items():
        print(
            f"   {parameter} - {freq_key} "
            f"({int(samples_per_year)} samples/year)"
        )

        all_values = []

        for years in YEARS:
            values = released.slope_se_batch(
                years,
                samples_per_year,
                sigma,
                rho,
                multipliers,
            )
            all_values.append(values)

        matrix = np.column_stack(all_values)

        for hid, row in zip(ids, matrix):
            key = (int(hid), parameter)

            if key not in se_lookup:
                se_lookup[key] = {}

            se_lookup[key][freq_key] = [
                round(float(v), 9)
                for v in row
            ]

print("Slope-SE arrays complete.")

print("\n5. Building compact attribute lookup...")

concs = power.pivot(
    index="lev10_HYBAS_ID",
    columns="parameter",
    values="current_concentration_mg_L_q50",
)

record_lookup = {}

for row in domain.itertuples(index=False):
    hid = int(row.lev10_HYBAS_ID)

    record_lookup[hid] = {
        "tn": round(float(concs.loc[hid, "TN"]), 6),
        "tp": round(float(concs.loc[hid, "TP"]), 6),
        "np": round(float(row.isotonic_NP_ratio), 4),
        "c": int(row.class_type),
        "cc": str(row.country_code),
        "ct": str(row.continent),
        "tnse": se_lookup[(hid, "TN")],
        "tpse": se_lookup[(hid, "TP")],
    }

print(f"Compact records prepared: {len(record_lookup):,}")

print("\n6. Inspecting HydroBASINS regional layers...")

zip_uri = "zip://" + str(HYBAS_ZIP)
layers = pyogrio.list_layers(zip_uri)

for layer_name, geometry_type in layers:
    print(f"   {layer_name}: {geometry_type}")

print("\n7. Assigning HydroBASINS region to each eligible catchment...")

id_to_region = {}

for layer_name, geometry_type in layers:
    region = hydro_region_from_layer(layer_name)

    print(f"   Reading IDs from {layer_name}...")

    g = gpd.read_file(
        zip_uri,
        layer=layer_name,
    )

    id_col = next(
        (
            c for c in [
                "HYBAS_ID",
                "hybas_id",
                "lev10_HYBAS_ID",
            ]
            if c in g.columns
        ),
        None,
    )

    if id_col is None:
        raise RuntimeError(
            f"No HydroBASINS ID field in {layer_name}"
        )

    ids = pd.to_numeric(
        g[id_col],
        errors="coerce",
    ).dropna().astype("int64")

    matched = ids[ids.isin(eligible_ids)]

    for hid in matched:
        id_to_region[int(hid)] = region

    print(f"      matched {len(matched):,} eligible catchments")

if len(id_to_region) != len(domain):
    missing = eligible_ids - set(id_to_region)
    raise RuntimeError(
        f"HydroBASINS region missing for {len(missing):,} catchments. "
        f"Examples: {sorted(missing)[:10]}"
    )

domain["hydro_region"] = domain["lev10_HYBAS_ID"].map(id_to_region)

print("\n8. Creating deterministic shard assignments...")

domain = domain.sort_values(
    [
        "hydro_region",
        "tile_y",
        "tile_x",
        "latitude",
        "longitude",
        "lev10_HYBAS_ID",
    ]
).reset_index(drop=True)

domain["shard_part"] = (
    domain.groupby(
        ["hydro_region", "tile_x", "tile_y"]
    )
    .cumcount()
    // MAX_PER_SHARD
).astype(int)

domain["shard_file"] = domain.apply(
    lambda r: make_shard_name(
        str(r["hydro_region"]),
        int(r["tile_x"]),
        int(r["tile_y"]),
        int(r["shard_part"]),
    ),
    axis=1,
)

shard_counts = (
    domain.groupby("shard_file")
    .size()
    .sort_values(ascending=False)
)

print(f"Total shards: {len(shard_counts):,}")
print(f"Largest shard: {int(shard_counts.iloc[0]):,} catchments")
print(f"Median shard: {float(shard_counts.median()):.0f} catchments")

if int(shard_counts.max()) > MAX_PER_SHARD:
    raise RuntimeError(
        "A shard exceeds MAX_PER_SHARD."
    )

id_to_shard = dict(
    zip(
        domain["lev10_HYBAS_ID"].astype(int),
        domain["shard_file"],
    )
)

print("\n9. Reading, simplifying and assigning geometry...")

features_by_shard = {}
found_ids = set()

for layer_name, geometry_type in layers:
    region = hydro_region_from_layer(layer_name)

    print(f"\n   Geometry: {layer_name}")

    g = gpd.read_file(
        zip_uri,
        layer=layer_name,
    )

    id_col = next(
        (
            c for c in [
                "HYBAS_ID",
                "hybas_id",
                "lev10_HYBAS_ID",
            ]
            if c in g.columns
        ),
        None,
    )

    g[id_col] = pd.to_numeric(
        g[id_col],
        errors="coerce",
    ).astype("Int64")

    g = g[
        g[id_col].isin(eligible_ids)
    ][[id_col, "geometry"]].copy()

    if not len(g):
        continue

    g = g.rename(columns={id_col: "id"})

    g = gpd.GeoDataFrame(
        g,
        geometry="geometry",
        crs=g.crs,
    ).to_crs(4326)

    print(f"      eligible polygons: {len(g):,}")
    print("      simplifying...")

    g["geometry"] = g.geometry.simplify(
        SIMPLIFY_TOLERANCE,
        preserve_topology=True,
    )

    for row in g.itertuples(index=False):
        hid = int(row.id)

        if hid in found_ids:
            continue

        shard_file = id_to_shard[hid]

        feature = {
            "type": "Feature",
            "id": hid,
            "properties": {
                "id": hid,
                **record_lookup[hid],
            },
            "geometry": mapping(row.geometry),
        }

        features_by_shard.setdefault(
            shard_file,
            [],
        ).append(feature)

        found_ids.add(hid)

    print(f"      cumulative polygons: {len(found_ids):,}")

print()
print(f"Unique polygons found: {len(found_ids):,}")
print(f"Expected polygons: {len(domain):,}")

if len(found_ids) != len(domain):
    missing = eligible_ids - found_ids
    raise RuntimeError(
        f"Missing {len(missing):,} polygons. "
        f"Examples: {sorted(missing)[:10]}"
    )

print("\n10. Writing full shard dataset...")

index_rows = []

total_raw = 0
total_gzip = 0

for i, shard_file in enumerate(
    sorted(features_by_shard),
    start=1,
):
    features = features_by_shard[shard_file]

    min_lon = 180.0
    min_lat = 90.0
    max_lon = -180.0
    max_lat = -90.0

    for feature in features:
        geom = feature["geometry"]

        # Bounds are taken from the original coordinate rows for the
        # catchments in this shard below, so no recursive geometry scan
        # is required here.

    shard_ids = [
        int(feature["properties"]["id"])
        for feature in features
    ]

    shard_domain = domain[
        domain["lev10_HYBAS_ID"].isin(shard_ids)
    ]

    min_lon = float(shard_domain["longitude"].min())
    max_lon = float(shard_domain["longitude"].max())
    min_lat = float(shard_domain["latitude"].min())
    max_lat = float(shard_domain["latitude"].max())

    # Expand the point-derived bbox to the full deterministic 5-degree
    # tile so viewport intersection remains conservative.
    first = shard_domain.iloc[0]

    tile_x = int(first["tile_x"])
    tile_y = int(first["tile_y"])

    tile_west = tile_x * TILE_DEGREES - 180.0
    tile_east = tile_west + TILE_DEGREES
    tile_south = tile_y * TILE_DEGREES - 90.0
    tile_north = tile_south + TILE_DEGREES

    bbox = [
        round(tile_west, 5),
        round(tile_south, 5),
        round(tile_east, 5),
        round(tile_north, 5),
    ]

    payload = {
        "type": "FeatureCollection",
        "metadata": {
            "mode": "modelled",
            "years": YEARS,
            "frequencies": {
                "m": "monthly",
                "f": "fortnightly",
                "w": "weekly",
                "t": "twice-weekly",
            },
            "tnThreshold": 0.800,
            "tpThreshold": 0.046,
            "alpha": 0.05,
            "targetPower": 0.80,
        },
        "features": features,
    }

    raw = json.dumps(
        payload,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")

    path = OUT / shard_file
    path.write_bytes(raw)

    gz_n = gzip_bytes(raw)

    total_raw += len(raw)
    total_gzip += gz_n

    index_rows.append({
        "file": shard_file,
        "count": len(features),
        "bbox": bbox,
        "tile": [tile_x, tile_y],
        "rawBytes": len(raw),
        "gzipBytes": gz_n,
    })

    if (
        i == 1
        or i % 50 == 0
        or i == len(features_by_shard)
    ):
        print(
            f"   written {i:,}/{len(features_by_shard):,} shards; "
            f"{sum(x['count'] for x in index_rows):,} catchments"
        )

index_payload = {
    "version": "modelled-global-v1",
    "mode": "modelled",
    "label": "Modelled catchments",
    "description": (
        "Modelled HydroBASINS Level-10 catchments."
    ),
    "simplificationDegrees": SIMPLIFY_TOLERANCE,
    "tileDegrees": TILE_DEGREES,
    "maxCatchmentsPerShard": MAX_PER_SHARD,
    "years": YEARS,
    "thresholdsMgL": {
        "TN": 0.800,
        "TP": 0.046,
    },
    "shards": index_rows,
}

index_path = OUT / "index.json"

index_path.write_text(
    json.dumps(
        index_payload,
        indent=2,
    ) + "\n",
    encoding="utf-8",
)

largest = max(
    x["gzipBytes"]
    for x in index_rows
)

summary = {
    "version": "modelled-global-v1",
    "catchments": len(domain),
    "shards": len(index_rows),
    "simplificationDegrees": SIMPLIFY_TOLERANCE,
    "tileDegrees": TILE_DEGREES,
    "maxCatchmentsPerShard": MAX_PER_SHARD,
    "raw_MB": total_raw / 1_000_000,
    "gzip_MB": total_gzip / 1_000_000,
    "mean_gzip_MB_per_shard": (
        total_gzip / len(index_rows) / 1_000_000
    ),
    "largest_gzip_MB": largest / 1_000_000,
    "smallest_shard_catchments": min(
        x["count"] for x in index_rows
    ),
    "largest_shard_catchments": max(
        x["count"] for x in index_rows
    ),
}

summary_path = OUT / "build-summary.json"

summary_path.write_text(
    json.dumps(
        summary,
        indent=2,
    ) + "\n",
    encoding="utf-8",
)

print()
print("=" * 80)
print("FULL MODELLED DATASET COMPLETE")
print("=" * 80)
print(json.dumps(summary, indent=2))
print()
print(f"Output: {OUT}")
