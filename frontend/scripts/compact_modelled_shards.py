#!/usr/bin/env python3
"""Shrink the modelled catchment shards while the map keeps drawing the same thing.

The shards are written at full float precision: coordinates carry 17 digits and slope
standard errors carry 9. The geometry was already simplified to 0.005 degrees, which is
557 metres, so most of those digits describe a shape that was thrown away. Rounding
coordinates to 4 decimal places keeps 11 metre precision, and rounding the standard
errors to 6 digits keeps a power value accurate far past the two decimals the map shows.

Run it over the directory build_modelled_global_shards.py produced:

    python compact_modelled_shards.py <shard dir> --out <compact dir>

It rewrites every shard, updates the byte counts in index.json, and prints the sizes.
"""

from __future__ import annotations

import argparse
import gzip
import json
import shutil
from pathlib import Path

COORD_DECIMALS = 4
SE_PRECISION = 6
COMPACT = (",", ":")
# Written alongside the shards by the build script, and copied across rather than rounded.
NON_SHARD = {"index.json", "build-summary.json"}


def round_coordinates(node: list, decimals: int) -> list:
    """Round a GeoJSON coordinate tree of any nesting depth."""
    if node and isinstance(node[0], (int, float)):
        return [round(value, decimals) for value in node]
    return [round_coordinates(child, decimals) for child in node]


def round_standard_errors(arrays: dict, precision: int) -> dict:
    """Round each frequency's duration array to a fixed number of digits."""
    return {
        frequency: [float(f"{value:.{precision}g}") for value in values]
        for frequency, values in arrays.items()
    }


def compact_shard(source: Path, target: Path, decimals: int, precision: int) -> tuple[int, int, int, int]:
    """Rewrite one shard. Returns size before, after, after gzip, and features left alone."""
    before = source.stat().st_size
    shard = json.loads(source.read_text(encoding="utf-8-sig"))
    skipped = 0

    for feature in shard["features"]:
        # Only 10,384 of the 618,553 catchments were seen while writing this, so anything
        # shaped differently is copied through untouched rather than crashing the run.
        geometry = feature.get("geometry")
        if geometry and "coordinates" in geometry:
            geometry["coordinates"] = round_coordinates(geometry["coordinates"], decimals)
        else:
            skipped += 1
        for key in ("tnse", "tpse"):
            arrays = feature.get("properties", {}).get(key)
            if isinstance(arrays, dict):
                feature["properties"][key] = round_standard_errors(arrays, precision)

    encoded = json.dumps(shard, separators=COMPACT).encode("utf-8")
    target.write_bytes(encoded)
    return before, len(encoded), len(gzip.compress(encoded, 9)), skipped


def rewrite_index(index_path: Path, target_dir: Path, decimals: int, precision: int) -> None:
    """Point index.json at the new sizes so the loader reports what it actually fetches."""
    index = json.loads(index_path.read_text(encoding="utf-8-sig"))
    index["compaction"] = {"coordinateDecimals": decimals, "sePrecision": precision}

    for entry in index["shards"]:
        shard = target_dir / entry["file"]
        if not shard.is_file():
            continue
        payload = shard.read_bytes()
        entry["rawBytes"] = len(payload)
        entry["gzipBytes"] = len(gzip.compress(payload, 9))

    (target_dir / index_path.name).write_bytes(
        json.dumps(index, separators=COMPACT).encode("utf-8")
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="directory holding the generated shards")
    parser.add_argument("--out", type=Path, required=True, help="directory to write into")
    parser.add_argument("--coord-decimals", type=int, default=COORD_DECIMALS)
    parser.add_argument("--se-precision", type=int, default=SE_PRECISION)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    shards = sorted(p for p in args.source.glob("*.json") if p.name not in NON_SHARD)
    if not shards:
        raise SystemExit(f"No shard files found in {args.source}")

    before = after = zipped = skipped = 0
    for position, shard in enumerate(shards, start=1):
        sizes = compact_shard(
            shard, args.out / shard.name, args.coord_decimals, args.se_precision
        )
        before += sizes[0]
        after += sizes[1]
        zipped += sizes[2]
        skipped += sizes[3]
        if position % 100 == 0 or position == len(shards):
            print(f"  {position}/{len(shards)} shards", flush=True)

    index_path = args.source / "index.json"
    if index_path.is_file():
        rewrite_index(index_path, args.out, args.coord_decimals, args.se_precision)

    summary = args.source / "build-summary.json"
    if summary.is_file():
        shutil.copy2(summary, args.out / summary.name)

    print(f"{len(shards)} shards")
    print(f"  before          {before / 1e6:>9.2f} MB")
    print(f"  after           {after / 1e6:>9.2f} MB   {100 * (1 - after / before):.0f}% smaller")
    print(f"  after, gzipped  {zipped / 1e6:>9.2f} MB   {100 * (1 - zipped / before):.0f}% smaller")
    if skipped:
        print(f"  {skipped} features had no geometry and were copied through unchanged")


if __name__ == "__main__":
    main()
