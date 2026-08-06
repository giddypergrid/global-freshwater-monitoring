"use client";

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { SAMPLING_FREQUENCIES, SAMPLING_YEARS } from "@/lib/power";
import type { Indicator, Query } from "@/lib/types";

interface Props {
  indicators: Indicator[];
  query: Query;
  onChange: (query: Query) => void;
}

interface SegmentedProps<T extends number> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

function Segmented<T extends number>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="grid grid-flow-col gap-1 rounded-md bg-slate-100 p-1">
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

/** The monitoring scenario: what is measured, how often, for how long, and how big a change. */
export default function QueryControls({ indicators, query, onChange }: Props) {
  const indicatorItems = useMemo(
    () => Object.fromEntries(indicators.map((i) => [i.key, i.label])),
    [indicators],
  );

  return (
    <section className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600">Indicator</label>
        <Select
          items={indicatorItems}
          value={query.indicator}
          onValueChange={(value) => onChange({ ...query, indicator: value as string })}
        >
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="start">
            {indicators.map((i) => (
              <SelectItem key={i.key} value={i.key}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600">Sampling duration</label>
        <Segmented
          options={SAMPLING_YEARS.map((y) => ({ value: y, label: `${y} yr` }))}
          value={query.years}
          onChange={(years) => onChange({ ...query, years })}
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600">Sampling frequency</label>
        <Segmented
          options={SAMPLING_FREQUENCIES}
          value={query.samplesPerYear}
          onChange={(samplesPerYear) => onChange({ ...query, samplesPerYear })}
        />
        <p className="text-[11px] text-slate-400 tabular-nums">
          {(query.years * query.samplesPerYear).toLocaleString()} samples in total
        </p>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <label className="text-xs font-medium text-slate-600">
            Water quality improvement
          </label>
          <span className="text-sm font-semibold text-slate-900 tabular-nums">
            {query.reduction}%
          </span>
        </div>
        <Slider
          min={5}
          max={80}
          step={5}
          value={query.reduction}
          onValueChange={(value) =>
            onChange({
              ...query,
              reduction: Array.isArray(value) ? value[0] : (value as number),
            })
          }
        />
        <p className="text-[11px] text-slate-400">
          The true drop in concentration the monitoring would need to pick up.
        </p>
      </div>
    </section>
  );
}
