import Link from "next/link";
import { Maximize2 } from "lucide-react";
import ToolShell from "@/components/tool/ToolShell";

const DATA_SOURCES = [
  { name: "HydroBASINS v1c", detail: "Catchment boundaries, level 06, dissolved to main basins." },
  { name: "HydroRIVERS v1.0", detail: "River reaches with Strahler stream order and discharge." },
  { name: "Natural Earth", detail: "Country outlines at 1:110m." },
];

export default function Home() {
  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="text-sm font-semibold">Global Freshwater Monitoring Design</span>
          <Link
            href="/tool"
            className="flex items-center gap-1.5 text-sm text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline"
          >
            <Maximize2 className="size-3.5" />
            Full screen
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-10">
          <h1 className="max-w-3xl text-2xl leading-snug font-semibold tracking-tight text-balance">
            Will a monitoring programme actually detect the improvement?
          </h1>
          <p className="mt-3 max-w-3xl text-[15px] leading-7 text-slate-600">
            Reducing nitrogen, phosphorus or sediment loss only shows up in the data if the
            monitoring is sensitive enough to see it. Pick a catchment and a sampling design
            below to see the probability that a real improvement would be detected.
          </p>
        </section>

        <section className="h-[82vh] min-h-[620px] overflow-hidden rounded-lg border border-slate-300 shadow-sm">
          <ToolShell />
        </section>

        <section className="border-b border-slate-200 py-12">
          <h2 className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Method
          </h2>
          <p className="mt-5 max-w-3xl text-sm leading-7 text-slate-600">
            A monitoring record is split into a before and after period and the means are
            compared. With <span className="font-mono text-[13px]">n</span> samples and a
            coefficient of variation <span className="font-mono text-[13px]">CV</span>, the
            standard error of that difference is{" "}
            <span className="font-mono text-[13px]">2·CV/√n</span>, and power is the
            probability that the observed drop clears the 5% significance threshold. Noisy
            reaches need either a bigger improvement or a longer, denser record before the
            change becomes visible.
          </p>
        </section>

        <section className="py-12">
          <h2 className="text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
            Data
          </h2>
          <dl className="mt-5 max-w-3xl divide-y divide-slate-100 border-y border-slate-100">
            {DATA_SOURCES.map((source) => (
              <div key={source.name} className="flex gap-6 py-3">
                <dt className="w-44 shrink-0 text-sm font-medium">{source.name}</dt>
                <dd className="text-sm text-slate-600">{source.detail}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 max-w-3xl rounded-md border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
            <span className="font-semibold">Prototype.</span> Catchment boundaries, river
            geometry and stream order are real. The water quality variability behind every
            power figure is synthetic, generated as smooth spatial noise so that neighbouring
            reaches behave plausibly. Nothing here should be read as a measurement of any
            actual river.
          </p>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-slate-500">
          Prototype built on the approach of the New Zealand Monitoring Freshwater
          Improvements webapp. Flags by flagcdn.com.
        </div>
      </footer>
    </div>
  );
}
