"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import {
  DURATIONS,
  FREQUENCIES,
  frequencyOption,
  plannedSampleCount,
} from "@/lib/power";
import type { DataIndex, NutrientKey, Query } from "@/lib/types";

interface Props {
  index: DataIndex;
  query: Query;
  /** Site counts for whatever is selected: catchment, else region, else the world. */
  counts: { tn: number; tp: number };
  scopeLabel: string;
  onChange: (query: Query) => void;
}

interface SegmentedProps<T extends string | number> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  columns?: string;
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  columns,
}: SegmentedProps<T>) {
  return (
    <div className={`grid gap-1 rounded-md bg-slate-100 p-1 ${columns ?? "grid-flow-col"}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded px-2 py-1.5 text-xs font-medium transition-colors ${
            option.value === value
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-500 hover:text-slate-800"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** The monitoring scenario: what is measured, how often, for how long, and how big a cut. */
export default function QueryControls({
  index,
  query,
  counts,
  scopeLabel,
  onChange,
}: Props) {
  const nutrientItems = Object.fromEntries(index.nutrients.map((n) => [n.key, n.label]));
  const frequency = frequencyOption(query.frequency);
  const samples = plannedSampleCount(query.years, frequency.samplesPerYear);

  return (
    <section className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-700">Nutrient</label>
        <Select
          items={nutrientItems}
          value={query.nutrient}
          onValueChange={(value) =>
            onChange({ ...query, nutrient: value as NutrientKey })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="start">
            {index.nutrients.map((n) => (
              <SelectItem key={n.key} value={n.key}>
                {n.label} · {counts[n.key].toLocaleString()} sites
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-slate-500">
          Site counts shown for {scopeLabel}.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-700">Sampling frequency</label>
        <Segmented
          options={FREQUENCIES.map((f) => ({ value: f.key, label: f.label }))}
          value={query.frequency}
          onChange={(key) => onChange({ ...query, frequency: key })}
          columns="grid-cols-3"
        />
        {frequency.extrapolated && (
          <p className="text-[11px] text-amber-700">
            {frequency.label} extrapolates the fitted temporal correlation below the
            interval most records were collected at. Treat as a conditional model
            projection.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-700">Monitoring duration</label>
        <Segmented
          options={DURATIONS.map((y) => ({ value: y, label: `${y}` }))}
          value={query.years}
          onChange={(years) => onChange({ ...query, years })}
          columns="grid-cols-5"
        />
        <p className="text-[11px] text-slate-500 tabular-nums">
          {query.years} years · {samples.toLocaleString()} planned samples, assuming no
          missed visits
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label className="text-xs font-medium text-slate-700">Target reduction</label>
          <span className="text-sm font-semibold text-slate-900 tabular-nums">
            {query.reduction}%
          </span>
        </div>
        <Slider
          min={5}
          max={95}
          step={1}
          value={query.reduction}
          onValueChange={(value) =>
            onChange({
              ...query,
              reduction: Array.isArray(value) ? value[0] : (value as number),
            })
          }
        />
        <p className="text-[11px] text-slate-500">
          The true drop in concentration, reached at the end of the monitoring period.
          Not a prediction that it will happen.
        </p>
      </div>
    </section>
  );
}
