import Link from "next/link";
import { ChevronRight, Maximize2 } from "lucide-react";
import ToolShell from "@/components/tool/ToolShell";

/**
 * Copy is quoted from Handover/WEBSITE_IMPLEMENTATION.md. Each section is one summary
 * line and one paragraph, so the page reads as three lines until something is opened.
 */
const SECTIONS: Section[] = [
  {
    heading: "Method",
    summary:
      "The statistical test is one-sided (H0: slope = 0; HA: slope < 0) with alpha = 0.05.",
    body:
      "Concentrations and changes are represented on the natural-log scale. The important " +
      "field is slope_se_per_year, the generalized least-squares standard error of the " +
      "annual linear trend; the reduction is deliberately not part of the compact table " +
      "because power can be calculated instantly for any reduction selected by the user.",
    formula:
      "slopeMagnitude = abs(log(1 - reductionPercent / 100) / durationYears)\n" +
      "power          = normalCDF(slopeMagnitude / slopeSE - 1.6448536269514722)",
    body2:
      "The calculation assumes regular sampling with no missing planned observations, the " +
      "fitted site-specific residual SD remains applicable in future, temporal correlation " +
      "follows the fitted continuous CAR(1), seasonal variance follows the fitted monthly " +
      "pattern, the prospective change is linear on the log scale, and the direction of " +
      "interest was specified before testing.",
  },
  {
    heading: "Data",
    summary:
      "15,313 monitored site–nutrient records across 1,177 HydroBASINS level 6 catchments.",
    body:
      "4,089 TN and 11,224 TP records, each with a fitted GAM-CAR(1) model, modelled " +
      "current annual median, threshold status and power readiness tier. The compact " +
      "lookup holds 765,650 rows: slope_se_per_year for every site across five sampling " +
      "frequencies and ten durations from 5 to 50 years.",
    body2:
      "Catchments are HydroBASINS level 6 v1c in EPSG:4326, 1,177 of 16,397 worldwide " +
      "containing at least one monitored site. The supplied GeoJSON is simplified for web " +
      "display and is not an authoritative analysis layer. River reaches inside an open " +
      "catchment come from HydroRIVERS v1.0 (HydroSHEDS, WWF), which shares that grid. " +
      "They are drawn as context: power is calculated at monitored sites and has not been " +
      "extrapolated to river reaches.",
  },
  {
    heading: "Limits",
    summary:
      "It is a monitoring-design calculation, not a prediction that the environmental " +
      "reduction will occur.",
    body:
      "Power refers to detecting a linear decrease in log concentration that reaches the " +
      "selected total proportional reduction at the end of the selected monitoring " +
      "duration. A catchment display summarizes the distribution of its monitored sites " +
      "with power at least 0.80; it must not be described as the power of a pooled " +
      "catchment-wide trend test.",
    body2:
      "Daily and weekly power extrapolate the fitted temporal dependence below the " +
      "dominant observed interval and may not represent storm-event, diurnal or " +
      "sensor-scale variability, so label these results as conditional model-based " +
      "projections. Missing samples, altered laboratory methods, changes in variance or " +
      "autocorrelation, and non-linear environmental responses can change realised power.",
  },
];

interface Section {
  heading: string;
  summary: string;
  body: string;
  /** Rendered between the two paragraphs; only the Method section has one. */
  formula?: string;
  body2: string;
}

/** Native details/summary. The chevron rotates via the open: variant, no JS. */
function Foldable({ heading, summary, body, formula, body2 }: Section) {
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-baseline gap-4 py-4 marker:content-none">
        <ChevronRight className="size-3.5 shrink-0 translate-y-0.5 text-slate-400 transition-transform group-open:rotate-90" />
        <span className="w-16 shrink-0 text-[11px] font-semibold tracking-[0.12em] text-slate-500 uppercase">
          {heading}
        </span>
        <span className="text-[14px] leading-[1.6] font-medium text-slate-900 group-hover:text-slate-600">
          {summary}
        </span>
      </summary>
      <div className="space-y-3.5 pb-5 pl-[6.5rem] text-[14px] leading-[1.75] text-slate-700">
        <p>{body}</p>
        {formula && (
          <pre className="overflow-x-auto rounded-md border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-slate-900">
            {formula}
          </pre>
        )}
        <p>{body2}</p>
      </div>
    </details>
  );
}

export default function Home() {
  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
          <div className="flex items-baseline gap-2.5">
            <span className="text-[15px] font-semibold tracking-tight">
              Global Freshwater Monitoring Design
            </span>
            <span className="hidden text-[13px] text-slate-500 sm:inline">
              TN and TP detection power
            </span>
          </div>
          <Link
            href="/tool"
            className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-2.5 py-1.5 text-[13px] font-medium text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-900"
          >
            <Maximize2 className="size-3.5" />
            Full screen
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-10">
          <h1 className="max-w-3xl text-[26px] leading-[1.3] font-semibold tracking-tight text-balance">
            Power to detect a proportional decrease in TN or TP at a monitored site
          </h1>
          <p className="mt-4 max-w-[68ch] text-[15px] leading-[1.75] text-slate-700">
            This implementation estimates the power to detect a user-defined proportional
            decrease in total nitrogen (TN) or total phosphorus (TP) at a monitored site.
          </p>
        </section>

        {/* `isolate` keeps Leaflet's own z-indexes inside this box. Its map pane is 400 and
            its controls are 800, so without a stacking context here they paint over the
            sticky header the moment the page scrolls. */}
        <section className="isolate h-[82vh] min-h-[620px] overflow-hidden rounded-lg border border-slate-300 shadow-sm">
          <ToolShell />
        </section>

        <section className="py-12">
          <div className="max-w-5xl divide-y divide-slate-200 border-y border-slate-200">
            {SECTIONS.map((section) => (
              <Foldable key={section.heading} {...section} />
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-6 py-6 text-[12px] text-slate-600">
          Basemap &copy; OpenStreetMap contributors, &copy; CARTO.
        </div>
      </footer>
    </div>
  );
}
