#!/usr/bin/env python3
"""Reference implementation for the monitored-site TN/TP power website.

This module restores ``power_details()`` from the original monitored-site
analysis and adds a command-line acceptance test against the delivered compact
lookup.  With its default ``frequency="monthly"`` argument, ``power_details``
is numerically equivalent to the function used to produce
``site_option2_power.csv``.  Other supported frequencies use the same
continuous-CAR(1) extension used by ``website_power_lookup.py``.

Example
-------
python power_details_reference_v1.py validate \
  --source site_option2_power.csv \
  --lookup monitored_site_slope_se_lookup.csv.gz \
  --rows 200
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm


VERSION = "2026-08-25-v1"
ALPHA = 0.05
FREQUENCIES = {
    "daily": 365.2425,
    "weekly": 365.2425 / 7.0,
    "fortnightly": 365.2425 / 14.0,
    "monthly": 12.0,
    "quarterly": 4.0,
}
WEIGHT_COLUMNS = tuple(f"residual_sd_weight_month_{m:02d}" for m in range(1, 13))


def regular_design(years: float, samples_per_year: float) -> tuple[np.ndarray, np.ndarray]:
    """Return the seasonal-plus-linear design and zero-based calendar month."""
    n = int(round(float(years) * float(samples_per_year)))
    if n < 3:
        raise ValueError("A prospective design must contain at least three samples")
    t = np.arange(n, dtype=float) / float(samples_per_year)
    phase = 2.0 * np.pi * np.mod(t, 1.0)
    design = np.column_stack(
        [
            np.ones(n),
            np.sin(phase),
            np.cos(phase),
            np.sin(2.0 * phase),
            np.cos(2.0 * phase),
            np.sin(3.0 * phase),
            np.cos(3.0 * phase),
            t,
        ]
    )
    month0 = np.minimum(
        np.floor(np.mod(t, 1.0) * 12.0 + 1e-10).astype(int), 11
    )
    return design, month0


def ar1_precision_multiply(x: np.ndarray, rho_interval: float) -> np.ndarray:
    """Multiply a vector or matrix by the inverse regular-AR(1) correlation."""
    rho_interval = float(np.clip(rho_interval, 0.0, 0.999999999))
    out = np.empty_like(x)
    out[0] = x[0] - rho_interval * x[1]
    out[-1] = x[-1] - rho_interval * x[-2]
    if len(x) > 2:
        out[1:-1] = (
            (1.0 + rho_interval**2) * x[1:-1]
            - rho_interval * x[:-2]
            - rho_interval * x[2:]
        )
    return out / max(1.0 - rho_interval**2, 1e-12)


def slope_standard_error(
    sigma: float,
    rho_month: float,
    variance_weights: np.ndarray,
    observe_years: float,
    frequency: str = "monthly",
) -> float:
    """GLS SE of the annual log-scale slope for a prospective regular design."""
    if frequency not in FREQUENCIES:
        raise ValueError(f"Unsupported frequency {frequency!r}; use {sorted(FREQUENCIES)}")
    if not np.isfinite(sigma) or sigma <= 0:
        raise ValueError("sigma must be finite and positive")
    if not np.isfinite(rho_month) or not (0 <= rho_month < 1):
        raise ValueError("rho_month must lie in [0, 1)")
    weights = np.asarray(variance_weights, dtype=float)
    if weights.shape != (12,) or np.any(~np.isfinite(weights)) or np.any(weights <= 0):
        raise ValueError("variance_weights must contain 12 finite positive values")
    if not np.isfinite(observe_years) or observe_years <= 0:
        raise ValueError("observe_years must be finite and positive")

    samples_per_year = FREQUENCIES[frequency]
    design, month0 = regular_design(observe_years, samples_per_year)
    rho_interval = float(rho_month) ** (12.0 / samples_per_year)
    standardized_design = design / weights[month0, None]
    q_design = ar1_precision_multiply(standardized_design, rho_interval)
    information = (standardized_design.T @ q_design) / (float(sigma) ** 2)
    covariance = np.linalg.pinv(information, rcond=1e-11)
    return float(math.sqrt(max(covariance[-1, -1], 1e-15)))


def power_details(
    total_log_change: float,
    sigma: float,
    rho: float,
    variance_weights: np.ndarray,
    observe_years: float,
    frequency: str = "monthly",
    alpha: float = ALPHA,
) -> tuple[float, float, float]:
    """Return analytical power, annual-slope SE and noncentrality parameter.

    ``total_log_change`` is the natural-log change completed at the end of the
    monitoring horizon. For a proportional reduction ``p`` expressed from 0
    to 100, use ``math.log1p(-p / 100)``.

    The first five parameters reproduce the original historical function. The
    optional frequency generalizes it using the same continuous-CAR(1) rule as
    the website lookup generator.
    """
    if not np.isfinite(total_log_change):
        raise ValueError("total_log_change must be finite")
    if not (0 < alpha < 0.5):
        raise ValueError("alpha must lie between 0 and 0.5")
    se = slope_standard_error(
        sigma, rho, variance_weights, observe_years, frequency=frequency
    )
    slope_magnitude = abs(float(total_log_change) / float(observe_years))
    ncp = slope_magnitude / se
    power = float(norm.cdf(ncp - norm.ppf(1.0 - alpha)))
    return power, se, ncp


def power_for_reduction(
    reduction_percent: float,
    duration_years: float,
    slope_se_per_year: float,
    alpha: float = ALPHA,
) -> float:
    """Browser-side power equation, implemented with SciPy's normal CDF."""
    if not np.isfinite(reduction_percent) or not (0 < reduction_percent < 100):
        raise ValueError("reduction_percent must be greater than 0 and less than 100")
    if not np.isfinite(duration_years) or duration_years <= 0:
        raise ValueError("duration_years must be finite and positive")
    if not np.isfinite(slope_se_per_year) or slope_se_per_year <= 0:
        raise ValueError("slope_se_per_year must be finite and positive")
    slope = abs(math.log1p(-reduction_percent / 100.0) / duration_years)
    return float(norm.cdf(slope / slope_se_per_year - norm.ppf(1.0 - alpha)))


def validate_lookup(source_path: Path, lookup_path: Path, rows: int, seed: int) -> dict:
    """Recalculate sampled lookup SEs and power directly from power_details()."""
    source = pd.read_csv(source_path)
    lookup = pd.read_csv(lookup_path)
    required_source = {
        "parameter", "site_id", "gam_car1_log_residual_sd", "gam_car1_monthly_rho",
        *WEIGHT_COLUMNS,
    }
    required_lookup = {
        "parameter", "site_id", "frequency", "duration_years", "slope_se_per_year"
    }
    missing_source = sorted(required_source - set(source.columns))
    missing_lookup = sorted(required_lookup - set(lookup.columns))
    if missing_source or missing_lookup:
        raise ValueError(
            f"Missing columns: source={missing_source or 'none'}, "
            f"lookup={missing_lookup or 'none'}"
        )
    if source.duplicated(["parameter", "site_id"]).any():
        raise ValueError("Source parameter + site_id keys are not unique")

    sample_n = min(int(rows), len(lookup))
    sampled = lookup.sample(sample_n, random_state=int(seed)).merge(
        source[
            [
                "parameter", "site_id", "gam_car1_log_residual_sd",
                "gam_car1_monthly_rho", *WEIGHT_COLUMNS,
            ]
        ],
        on=["parameter", "site_id"],
        how="left",
        validate="many_to_one",
        indicator=True,
    )
    if not (sampled["_merge"] == "both").all():
        raise ValueError("At least one sampled lookup row did not join to the source")

    recalculated_se = []
    recalculated_power = []
    lookup_power = []
    reduction = 30.0
    total_log_change = math.log1p(-reduction / 100.0)
    for row in sampled.itertuples(index=False):
        weights = np.asarray([getattr(row, c) for c in WEIGHT_COLUMNS], dtype=float)
        power, se, _ = power_details(
            total_log_change,
            float(row.gam_car1_log_residual_sd),
            float(row.gam_car1_monthly_rho),
            weights,
            float(row.duration_years),
            frequency=str(row.frequency),
        )
        recalculated_se.append(se)
        recalculated_power.append(power)
        lookup_power.append(
            power_for_reduction(reduction, row.duration_years, row.slope_se_per_year)
        )

    sampled["recalculated_se"] = recalculated_se
    sampled["recalculated_power"] = recalculated_power
    sampled["lookup_power"] = lookup_power
    se_abs = np.abs(sampled["recalculated_se"] - sampled["slope_se_per_year"])
    power_abs = np.abs(sampled["recalculated_power"] - sampled["lookup_power"])
    monthly = sampled["frequency"].eq("monthly")
    result = {
        "version": VERSION,
        "rows_checked": sample_n,
        "monthly_rows_checked": int(monthly.sum()),
        "max_absolute_se_difference": float(se_abs.max()),
        "max_absolute_power_difference": float(power_abs.max()),
        "all_frequencies_pass_1e_12": bool(
            (se_abs <= 1e-12).all() and (power_abs <= 1e-12).all()
        ),
        "monthly_power_details_pass_1e_12": bool(
            monthly.any()
            and (se_abs[monthly] <= 1e-12).all()
            and (power_abs[monthly] <= 1e-12).all()
        ),
    }
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    validate = subparsers.add_parser("validate", help="validate against compact lookup")
    validate.add_argument("--source", type=Path, required=True)
    validate.add_argument("--lookup", type=Path, required=True)
    validate.add_argument("--rows", type=int, default=200)
    validate.add_argument("--seed", type=int, default=20260825)
    args = parser.parse_args()

    if args.command == "validate":
        result = validate_lookup(args.source, args.lookup, args.rows, args.seed)
        print(json.dumps(result, indent=2))
        if not result["monthly_power_details_pass_1e_12"]:
            raise SystemExit("FAIL: monthly power_details did not reproduce lookup")
        if not result["all_frequencies_pass_1e_12"]:
            raise SystemExit("FAIL: generalized power_details did not reproduce lookup")


if __name__ == "__main__":
    main()
