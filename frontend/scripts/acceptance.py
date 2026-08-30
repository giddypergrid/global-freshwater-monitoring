"""Acceptance tests from Handover/WEBSITE_IMPLEMENTATION.md, section
"Validation and acceptance tests".

Run:  python scripts/acceptance.py
Exit code 0 if every runnable test passes.

Test 1 needs the researcher's power_details(), which was missing from the original
handover. Rich McDowell supplied it on 25 Aug 2026 as power_details_reference_v1.py,
alongside site_option2_power.csv, the fitted site parameters it reads. That CSV is base
data and stays outside this repository, so the test reports itself unrunnable rather than
failing when the file is absent.
"""

from __future__ import annotations

import json
import math
import random
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

ROOT = Path(__file__).resolve().parent.parent
HANDOVER = ROOT.parent.parent / "Handover"
# Rich McDowell's 25 Aug 2026 reference module and the fitted site parameters it needs.
# Base data, so it sits beside the handover rather than inside the repository.
REFERENCE = ROOT.parent.parent / "acceptance"
DATA = ROOT / "public" / "data"
Z_ALPHA = 1.6448536269514722
RNG = np.random.default_rng(20260823)

results: list[tuple[str, bool | None, str]] = []


def record(name: str, ok: bool | None, detail: str) -> None:
    results.append((name, ok, detail))
    mark = "PASS" if ok else ("FAIL" if ok is False else "N/A ")
    print(f"  {mark}  {name}")
    for line in detail.splitlines():
        print(f"          {line}")


def browser_values() -> dict:
    out = subprocess.run(
        ["node", "--experimental-strip-types", str(ROOT / "scripts" / "emit_cdf.mjs")],
        capture_output=True,
        text=True,
        cwd=ROOT,
        check=True,
    )
    return json.loads(out.stdout)


# --- 1 ------------------------------------------------------------------------------
def test_1(n: int = 200) -> None:
    """Recompute the delivered SE and power through the researcher's power_details()."""
    source = REFERENCE / "site_option2_power.csv"
    if not source.exists():
        record(
            "1. reproduce power_details() values",
            None,
            f"{source.name} holds the fitted site parameters and is base data, so it is\n"
            "not in this repository and the test cannot run from a clone alone.",
        )
        return

    sys.path.insert(0, str(ROOT / "scripts"))
    from power_details_reference_v1 import validate_lookup

    out = validate_lookup(
        source,
        HANDOVER / "monitored_site_slope_se_lookup.csv",
        rows=n,
        seed=20260825,
    )
    ok = out["all_frequencies_pass_1e_12"] and out["monthly_power_details_pass_1e_12"]
    record(
        f"1. reproduce power_details() values on {n} random lookup rows",
        ok,
        f"reference module {out['version']}, {out['monthly_rows_checked']} of "
        f"{out['rows_checked']} sampled rows are monthly\n"
        f"max absolute SE difference {out['max_absolute_se_difference']:.3e}\n"
        f"max absolute power difference {out['max_absolute_power_difference']:.3e}"
        " (limit 1e-12)",
    )


# --- 2 ------------------------------------------------------------------------------
def test_2(n: int = 200) -> None:
    """Every shipped SE must equal the source CSV row it came from."""
    lookup = pd.read_csv(
        HANDOVER / "monitored_site_slope_se_lookup.csv",
        dtype={"site_parameter_id": "string"},
    )
    random.seed(7)
    rows = lookup.sample(n=n, random_state=7)

    slices: dict[tuple[str, str], dict] = {}
    worst = 0.0
    checked = 0
    for row in rows.itertuples(index=False):
        key = (row.parameter.lower(), row.frequency)
        if key not in slices:
            slices[key] = json.loads((DATA / "power" / f"{key[0]}-{key[1]}.json").read_text())
        sl = slices[key]
        served = sl["se"][row.site_parameter_id][sl["durations"].index(row.duration_years)]
        # The build keeps SE to 4 digits, so compare at that precision.
        rel = abs(served - row.slope_se_per_year) / row.slope_se_per_year
        worst = max(worst, rel)
        checked += 1

    ok = worst < 5e-4
    record(
        f"2. reproduce {n} random lookup rows in Python",
        ok,
        f"checked {checked} rows against the source CSV\n"
        f"worst relative difference {worst:.2e} (limit 5e-4, the 4-digit rounding)",
    )


# --- 3 ------------------------------------------------------------------------------
def test_3(vals: dict) -> None:
    z = np.array([p[0] for p in vals["cdf"]])
    ours = np.array([p[1] for p in vals["cdf"]])
    worst = float(np.max(np.abs(ours - norm.cdf(z))))
    ok = worst < 1e-5
    record(
        "3. browser normalCdf vs scipy.stats.norm.cdf",
        ok,
        f"{len(z)} points over z in [-6, 6]\n"
        f"max absolute difference {worst:.3e} (limit 1e-5)",
    )


# --- 4 ------------------------------------------------------------------------------
def test_4(vals: dict) -> None:
    frame = pd.DataFrame(vals["power"], columns=["se", "years", "pct", "slope", "power"])
    breaks = []
    for (se, years), grp in frame.groupby(["se", "years"]):
        grp = grp.sort_values("pct")
        diffs = grp.power.diff().dropna()
        if (diffs < -1e-12).any():
            breaks.append(f"se={se} years={years}")
    ok = not breaks
    record(
        "4. power increases with a larger reduction",
        ok,
        f"{frame.se.nunique()} SE values x {frame.years.nunique()} durations = "
        f"{len(frame.groupby(['se', 'years']))} curves, 11 reductions each\n"
        + ("every curve non-decreasing" if ok else f"not monotonic: {breaks[:5]}"),
    )


# --- 5 ------------------------------------------------------------------------------
def test_5(vals: dict) -> None:
    bad = [f"{pct}% returned {p}" for pct, p in vals["rejected"] if p != 0]
    ok = not bad
    shown = ", ".join(str(p[0]) for p in vals["rejected"])
    record(
        "5. invalid reductions rejected, not shown as power",
        ok,
        f"inputs tested: {shown}\n"
        + ("all returned 0" if ok else f"leaked a value: {bad}"),
    )


# --- 6 ------------------------------------------------------------------------------
def whiten(y: np.ndarray, design: np.ndarray, rho: float):
    """Prais-Winsten transform. OLS on the result equals GLS on an AR(1) series, in O(n)
    rather than the O(n^3) of inverting the covariance matrix."""
    f = math.sqrt(1.0 - rho**2)
    yw = np.empty_like(y)
    xw = np.empty_like(design)
    yw[0] = f * y[0]
    xw[0] = f * design[0]
    yw[1:] = y[1:] - rho * y[:-1]
    xw[1:] = design[1:] - rho * design[:-1]
    return yw, xw


def test_6(n_sim: int = 2000) -> None:
    """Generate real AR(1) series, fit the trend, and compare the rejection rate against
    the analytical power. This checks the covariance maths, not just the normal tail."""
    grid = []
    for freq_label, per_year in [
        ("quarterly", 4.0),
        ("monthly", 12.0),
        ("fortnightly", 26.08875),
        ("weekly", 52.1775),
        ("daily", 365.2425),
    ]:
        for rho_month in (0.15, 0.75):          # low / high autocorrelation
            for sd in (0.25, 0.9):              # low / high residual SD
                for years in (5, 30):           # short / long
                    for pct in (20, 60):        # small / large reduction
                        grid.append((freq_label, per_year, rho_month, sd, years, pct))

    worst_power = 0.0
    worst_se = 0.0
    lines = []
    for freq_label, per_year, rho_month, sd, years, pct in grid:
        n = int(round(years * per_year))
        rho = rho_month ** (12.0 / per_year)    # the spec's interval conversion
        t = np.arange(n) / per_year
        design = np.column_stack([np.ones(n), t])

        _, xw = whiten(np.zeros(n), design, rho)
        cov = np.linalg.inv(xw.T @ xw)
        se = float(sd * math.sqrt(cov[1, 1]))

        slope = -abs(math.log1p(-pct / 100) / years)
        predicted = norm.cdf(abs(slope) / se - Z_ALPHA)

        # AR(1) errors, built from white noise with the stationary first draw.
        eps = RNG.normal(0.0, sd, size=(n_sim, n))
        err = np.empty_like(eps)
        err[:, 0] = eps[:, 0] / math.sqrt(1.0 - rho**2)
        for i in range(1, n):
            err[:, i] = rho * err[:, i - 1] + eps[:, i]
        series = slope * t + err

        beta = np.empty(n_sim)
        for k in range(n_sim):
            yw, _ = whiten(series[k], design, rho)
            beta[k] = np.linalg.lstsq(xw, yw, rcond=None)[0][1]

        empirical = float(np.mean(beta / se < -Z_ALPHA))
        se_ratio = float(np.std(beta, ddof=1) / se)

        gap = abs(empirical - predicted)
        worst_power = max(worst_power, gap)
        worst_se = max(worst_se, abs(se_ratio - 1.0))
        if gap > 0.03:
            lines.append(
                f"{freq_label} rho={rho_month} sd={sd} {years}y {pct}%: "
                f"predicted {predicted:.3f} simulated {empirical:.3f}"
            )

    # 2000 draws puts the Monte Carlo error near 0.011 at power 0.5.
    ok = worst_power < 0.04 and worst_se < 0.10
    record(
        "6. correlated simulation matches the analytical power",
        ok,
        f"{len(grid)} stratified cells (5 frequencies x low/high rho x low/high SD "
        f"x short/long x small/large), {n_sim} fitted series each\n"
        f"worst power gap {worst_power:.4f} (limit 0.04, Monte Carlo error alone is 0.011)\n"
        f"worst SE ratio off 1.0 by {worst_se:.4f} (limit 0.10)\n"
        + ("\n".join(lines) if lines else "every cell within tolerance"),
    )


# --- 7 ------------------------------------------------------------------------------
def test_7() -> None:
    power_ts = (ROOT / "lib" / "power.ts").read_text(encoding="utf-8")
    offenders = [w for w in ("simulat", "montecarlo", "monte carlo", "random") if w in power_ts.lower()]
    ok = not offenders
    record(
        "7. production queries do not simulate",
        ok,
        "lib/power.ts is closed-form only: normalCdf plus arithmetic\n"
        + ("no simulation code in the query path" if ok else f"found: {offenders}"),
    )


def main() -> None:
    print("Acceptance tests, WEBSITE_IMPLEMENTATION.md section 'Validation and acceptance tests'\n")
    vals = browser_values()
    test_1()
    test_2()
    test_3(vals)
    test_4(vals)
    test_5(vals)
    test_6()
    test_7()

    failed = [name for name, ok, _ in results if ok is False]
    unrunnable = [name for name, ok, _ in results if ok is None]
    passed = [name for name, ok, _ in results if ok is True]
    print(f"\n{len(passed)} passed, {len(failed)} failed, {len(unrunnable)} could not be run")
    if failed:
        print("FAILED: " + ", ".join(failed))
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
