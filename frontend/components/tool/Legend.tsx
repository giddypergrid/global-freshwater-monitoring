import { POWER_LEGEND } from "@/lib/power";

interface Props {
  /** The river network is only drawn inside an open catchment, so its key follows it. */
  showRivers: boolean;
}

/** Power colour key, pinned over the map's bottom-right corner. */
export default function Legend({ showRivers }: Props) {
  return (
    <div className="absolute bottom-6 right-3 z-[1000] rounded-md border border-slate-300 bg-white/95 px-3 py-2 shadow-sm">
      <div className="mb-1.5 text-[11px] font-medium tracking-wide text-slate-700 uppercase">
        Detection power
      </div>
      <div className="flex items-end gap-0">
        {POWER_LEGEND.map((entry) => (
          <div key={entry.label} className="flex flex-col items-center">
            <span
              className="block h-3 w-16 border-r border-white"
              style={{ backgroundColor: entry.colour }}
            />
            <span className="mt-1 text-[10px] tabular-nums text-slate-700">
              {entry.label}
            </span>
          </div>
        ))}
      </div>
      {showRivers && (
        <div className="mt-2 flex items-center gap-2 border-t border-slate-200 pt-2">
          <span className="block h-0.5 w-6 rounded bg-[#2b7fb8]" />
          <span className="text-[10px] text-slate-700">
            River network, width by Strahler order
          </span>
        </div>
      )}
    </div>
  );
}
