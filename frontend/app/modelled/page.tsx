"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";

import {
  frequencyLabel,
  type ModelledFeature,
  type ModelledFrequency,
} from "@/lib/modelled";

import {
  formatPower,
  minDetectableReduction,
  powerForReduction,
} from "@/lib/power";

const ModelledMap = dynamic(
  () => import("@/components/tool/ModelledMap"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-slate-100 text-sm text-slate-500">
        Loading modelled map...
      </div>
    ),
  },
);

type Nutrient = "tn" | "tp";

const YEARS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

const FREQUENCIES: ModelledFrequency[] = [
  "m",
  "f",
  "w",
  "t",
];

export default function ModelledPrototypePage() {
  const [nutrient, setNutrient] = useState<Nutrient>("tn");
  const [frequency, setFrequency] =
    useState<ModelledFrequency>("m");
  const [years, setYears] = useState(20);
  const [reduction, setReduction] = useState(30);

  const [selected, setSelected] =
    useState<ModelledFeature | null>(null);

  const selectedResult = useMemo(() => {
    if (!selected) return null;

    const p = selected.properties;
    const yearIndex = YEARS.indexOf(years);

    const se =
      nutrient === "tn"
        ? p.tnse[frequency][yearIndex]
        : p.tpse[frequency][yearIndex];

    const power = powerForReduction(
      reduction,
      years,
      se,
    );

    const mdr = minDetectableReduction(
      se,
      years,
    );

    return {
      se,
      power,
      mdr,
    };
  }, [
    selected,
    nutrient,
    frequency,
    years,
    reduction,
  ]);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <Link
            href="/"
            className="text-sm font-semibold text-slate-900"
          >
            Global Freshwater Monitoring Design
          </Link>

          <p className="text-xs text-slate-500">
            Modelled Level-10 catchments
          </p>
        </div>

        <Link
          href="/tool"
          className="text-xs text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline"
        >
          Monitored sites
        </Link>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="max-h-[48%] w-full shrink-0 overflow-y-auto border-b border-slate-200 bg-white md:max-h-none md:w-[340px] md:border-r md:border-b-0 lg:w-[380px]">
          <div className="space-y-6 p-4">

            <div>
              <h2 className="mb-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                Data source
              </h2>

              <p className="text-sm leading-6 text-slate-700">
                Modelled HydroBASINS Level-10 catchments.
                This tool contains 618,553 modelled HydroBASINS Level-10 catchments.
              </p>
            </div>

            <div className="border-t border-slate-200 pt-5">
              <h2 className="mb-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                Nutrient
              </h2>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setNutrient("tn")}
                  className={`rounded border px-3 py-2 text-sm ${
                    nutrient === "tn"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  Total nitrogen
                </button>

                <button
                  type="button"
                  onClick={() => setNutrient("tp")}
                  className={`rounded border px-3 py-2 text-sm ${
                    nutrient === "tp"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  Total phosphorus
                </button>
              </div>
            </div>

            <div className="border-t border-slate-200 pt-5">
              <h2 className="mb-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                Monitoring design
              </h2>

              <label className="block text-xs font-medium text-slate-700">
                Sampling frequency
              </label>

              <select
                value={frequency}
                onChange={(e) =>
                  setFrequency(
                    e.target.value as ModelledFrequency,
                  )
                }
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {FREQUENCIES.map((key) => (
                  <option key={key} value={key}>
                    {frequencyLabel(key)}
                  </option>
                ))}
              </select>

              <label className="mt-4 block text-xs font-medium text-slate-700">
                Duration
              </label>

              <select
                value={years}
                onChange={(e) =>
                  setYears(Number(e.target.value))
                }
                className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                {YEARS.map((value) => (
                  <option key={value} value={value}>
                    {value} years
                  </option>
                ))}
              </select>

              <label className="mt-4 block text-xs font-medium text-slate-700">
                Reduction: {reduction}%
              </label>

              <input
                type="range"
                min={5}
                max={60}
                step={5}
                value={reduction}
                onChange={(e) =>
                  setReduction(Number(e.target.value))
                }
                className="mt-2 w-full"
              />
            </div>

            <div className="border-t border-slate-200 pt-5">
              <h2 className="mb-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                Selected catchment
              </h2>

              {!selected && (
                <p className="text-sm text-slate-500">
                  Click a coloured modelled catchment on the map.
                </p>
              )}

              {selected && selectedResult && (
                <div className="space-y-3 text-sm text-slate-700">
                  <div>
                    <span className="font-medium">
                      Level-10 ID:
                    </span>{" "}
                    {selected.properties.id}
                  </div>

                  <div>
                    <span className="font-medium">
                      Country:
                    </span>{" "}
                    {selected.properties.cc}
                  </div>

                  <div>
                    <span className="font-medium">
                      Continent:
                    </span>{" "}
                    {selected.properties.ct}
                  </div>

                  <div>
                    <span className="font-medium">
                      Modelled TN:
                    </span>{" "}
                    {selected.properties.tn.toFixed(3)} mg/L
                  </div>

                  <div>
                    <span className="font-medium">
                      Modelled TP:
                    </span>{" "}
                    {selected.properties.tp.toFixed(3)} mg/L
                  </div>

                  <div>
                    <span className="font-medium">
                      Modelled N:P ratio:
                    </span>{" "}
                    {selected.properties.np.toFixed(2)}
                  </div>

                  <div>
                    <span className="font-medium">
                      Class:
                    </span>{" "}
                    Type {selected.properties.c}
                  </div>

                  <div className="rounded border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <span className="font-medium">
                        Detection power:
                      </span>{" "}
                      {formatPower(selectedResult.power)}
                    </div>

                    <div className="mt-1">
                      <span className="font-medium">
                        Minimum detectable reduction:
                      </span>{" "}
                      {selectedResult.mdr.toFixed(1)}%
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="text-xs text-slate-600 underline underline-offset-2"
                  >
                    Clear selection
                  </button>
                </div>
              )}
            </div>

            <p className="border-t border-slate-200 pt-5 text-[11px] leading-[1.7] text-slate-600">
              One-sided test of a negative trend,
              alpha 0.05 and target power 0.80.
              Concentrations are modelled Level-10
              catchment estimates. Power is a
              monitoring-design calculation, not a
              prediction that the reduction will occur.
            </p>
          </div>
        </aside>

        <main className="min-h-[320px] min-w-0 flex-1">
          <ModelledMap
            nutrient={nutrient}
            frequency={frequency}
            years={years}
            reduction={reduction}
            selectedId={
              selected?.properties.id ?? null
            }
            onSelect={setSelected}
          />
        </main>
      </div>
    </div>
  );
}



