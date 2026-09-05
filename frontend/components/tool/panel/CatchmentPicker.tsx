"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { siteCountFor } from "@/lib/summary";
import type {
  CatchmentSummary,
  NutrientKey,
  RegionSummary,
} from "@/lib/types";

interface Props {
  regions: RegionSummary[];
  catchments: CatchmentSummary[];
  region: string;
  nutrient: NutrientKey;
  selectedId: string | null;
  onRegionChange: (region: string) => void;
  onSelect: (id: string) => void;
}

const MAX_VISIBLE = 200;

/**
 * Region first, then catchment, by map click or from here, kept in sync.
 *
 * HydroBASINS carries no place names, so a catchment is identified by its HYBAS_ID and
 * the list is ordered by how much monitoring sits inside it. Typing searches every
 * region by id or region name.
 */
export default function CatchmentPicker({
  regions,
  catchments,
  region,
  nutrient,
  selectedId,
  onRegionChange,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const regionItems = useMemo(
    () => Object.fromEntries(regions.map((r) => [r.name, r.name])),
    [regions],
  );

  const selected = catchments.find((c) => c.id === selectedId) ?? null;

  // Showing the selection unless the user is actively typing over it.
  const inputValue = typing ? text : (selected?.id ?? "");
  const term = typing ? text.trim().toLowerCase() : "";

  const visible = useMemo(() => {
    const pool = term
      ? catchments.filter(
          (c) => c.id.includes(term) || c.region.toLowerCase().includes(term),
        )
      : region
        ? catchments.filter((c) => c.region === region)
        : catchments; // no region yet, so the whole world is on offer

    // 1,177 rows would be a scroll to nowhere; the busiest catchments come first.
    // Ranked and counted for the nutrient on screen, since `records` adds total nitrogen
    // and total phosphorus together and would offer catchments holding none of the one
    // being viewed.
    return [...pool]
      .sort((a, b) => siteCountFor(b, nutrient) - siteCountFor(a, nutrient))
      .slice(0, MAX_VISIBLE);
  }, [catchments, region, term, nutrient]);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (!boxRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setTyping(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function pick(id: string) {
    onSelect(id);
    setOpen(false);
    setTyping(false);
    setText("");
  }

  return (
    <section className="space-y-3">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-700">Region</label>
        <Select
          items={regionItems}
          value={region}
          onValueChange={(value) => {
            onRegionChange(value as string);
            setTyping(false);
            setText("");
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Anywhere · click the map" />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="start">
            {regions.map((r) => (
              <SelectItem key={r.name} value={r.name}>
                {r.name} ({r.catchments} catchments, {r.sites.toLocaleString()} sites)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5" ref={boxRef}>
        <label className="text-xs font-medium text-slate-700">Catchment (HYBAS_ID)</label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-3.5 text-slate-400" />
          <input
            value={inputValue}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setText(e.target.value);
              setTyping(true);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                setTyping(false);
              }
              if (e.key === "Enter" && visible.length > 0) pick(visible[0].id);
            }}
            placeholder="Search by id or region"
            className="h-9 w-full rounded-md border border-slate-300 bg-white pr-8 pl-8 font-mono text-sm placeholder:font-sans placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 focus:outline-none"
          />
          <ChevronDown
            className={`pointer-events-none absolute top-2.5 right-2.5 size-3.5 text-slate-400 transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />

          {open && (
            <ul className="absolute z-20 mt-1 max-h-56 w-full divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-300 bg-white shadow-lg">
              {visible.map((c) => {
                const active = c.id === selectedId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => pick(c.id)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        active
                          ? "bg-slate-800 font-medium text-white"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <span className="truncate font-mono text-xs">{c.id}</span>
                      <span
                        className={`shrink-0 text-xs tabular-nums ${
                          active ? "text-slate-300" : "text-slate-500"
                        }`}
                      >
                        {siteCountFor(c, nutrient)} sites
                      </span>
                    </button>
                  </li>
                );
              })}
              {visible.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-slate-500">
                  No match for “{text}”.
                </li>
              )}
            </ul>
          )}
        </div>

        {!open && !selected && (
          <p className="text-[11px] text-slate-500">
            Click any catchment on the map, or search here.
          </p>
        )}
      </div>
    </section>
  );
}
