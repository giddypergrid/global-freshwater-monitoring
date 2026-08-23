"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCsv, csvFilename } from "@/lib/summary";
import type { SiteResult } from "@/lib/summary";
import type { Query } from "@/lib/types";

interface Props {
  results: SiteResult[];
  query: Query;
  scope: string;
}

/** Kept in its own block rather than buried in a step. It is the tool's output. */
export default function DownloadBlock({ results, query, scope }: Props) {
  function handleDownload() {
    if (results.length === 0) return;

    const blob = new Blob([buildCsv(results, query)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFilename(scope, query);
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <Button
        onClick={handleDownload}
        disabled={results.length === 0}
        variant="outline"
        className="w-full justify-center"
      >
        <Download className="size-4" />
        Download results (CSV)
      </Button>
      <p className="mt-2 text-[11px] text-slate-500">
        {results.length
          ? `${results.length.toLocaleString()} site records with slope SE, power and smallest detectable reduction.`
          : "Select a catchment to enable the export."}
      </p>
    </div>
  );
}
