import { POWER_LEGEND } from "@/lib/power";

/** Power colour key, pinned over the map's bottom-right corner. */
export default function Legend() {
  return (
    <div className="absolute bottom-6 right-3 z-[1000] rounded-md border border-slate-300 bg-white/95 px-3 py-2 shadow-sm">
      <div className="mb-1.5 text-[11px] font-medium tracking-wide text-slate-600 uppercase">
        Detection power
      </div>
      <div className="flex items-end gap-0">
        {POWER_LEGEND.map((entry) => (
          <div key={entry.label} className="flex flex-col items-center">
            <span
              className="block h-3 w-11 border-r border-white"
              style={{ backgroundColor: entry.colour }}
            />
            <span className="mt-1 text-[10px] tabular-nums text-slate-600">
              {entry.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
