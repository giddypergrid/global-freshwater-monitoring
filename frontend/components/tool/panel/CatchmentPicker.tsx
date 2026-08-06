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
import Flag from "@/components/tool/Flag";
import type { CatchmentSummary, CountrySummary } from "@/lib/types";

interface Props {
  countries: CountrySummary[];
  catchments: CatchmentSummary[];
  country: string;
  selectedId: string | null;
  onCountryChange: (country: string) => void;
  onSelect: (id: string) => void;
}

/**
 * Country first, then catchment — by map click or from here, kept in sync.
 *
 * The catchment field is a combobox: it shows the current selection, opens its list on
 * focus, and re-filters as you type. Typing searches every country (by catchment or
 * country name), so "germ" or "rhine" both reach the Rhine without changing country first.
 */
export default function CatchmentPicker({
  countries,
  catchments,
  country,
  selectedId,
  onCountryChange,
  onSelect,
}: Props) {
  const [open, setOpen] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  const countryItems = useMemo(
    () => Object.fromEntries(countries.map((c) => [c.name, c.name])),
    [countries],
  );

  const selected = catchments.find((c) => c.id === selectedId) ?? null;

  // Showing the selection unless the user is actively typing over it.
  const inputValue = typing ? text : (selected?.name ?? "");
  const term = typing ? text.trim().toLowerCase() : "";

  const visible = useMemo(() => {
    const pool = term
      ? catchments.filter(
          (c) =>
            c.name.toLowerCase().includes(term) || c.country.toLowerCase().includes(term),
        )
      : catchments.filter((c) => c.country === country);

    return [...pool].sort((a, b) => b.areaKm2 - a.areaKm2);
  }, [catchments, country, term]);

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
        <label className="text-xs font-medium text-slate-600">Country</label>
        <Select
          items={countryItems}
          value={country}
          onValueChange={(value) => {
            onCountryChange(value as string);
            setTyping(false);
            setText("");
          }}
        >
          <SelectTrigger className="w-full">
            <span className="flex items-center gap-2">
              <Flag country={country} />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="start">
            {countries.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                <span className="flex items-center gap-2">
                  <Flag country={c.name} />
                  {c.name} ({c.catchmentCount})
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5" ref={boxRef}>
        <label className="text-xs font-medium text-slate-600">Catchment</label>
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
            placeholder="Search any country or catchment"
            className="h-9 w-full rounded-md border border-slate-300 bg-white pr-8 pl-8 text-sm placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200 focus:outline-none"
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
                const elsewhere = c.country !== country;
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
                      <span className="flex min-w-0 items-center gap-2">
                        {elsewhere && <Flag country={c.country} />}
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span
                        className={`shrink-0 text-xs tabular-nums ${
                          active ? "text-slate-300" : "text-slate-400"
                        }`}
                      >
                        {c.areaKm2.toLocaleString()} km²
                      </span>
                    </button>
                  </li>
                );
              })}
              {visible.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-slate-400">
                  Nothing matches “{text}”.
                </li>
              )}
            </ul>
          )}
        </div>

        {!open && !selected && (
          <p className="text-[11px] text-slate-400">
            Pick one here or click a catchment on the map.
          </p>
        )}
      </div>
    </section>
  );
}
