"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildCsv, csvFilename } from "@/lib/summary";
import type { CatchmentDetail, Query } from "@/lib/types";

interface Props {
  detail: CatchmentDetail | null;
  query: Query;
  indicatorLabel: string;
}

/** Kept in its own block rather than buried in a step — it is the tool's output. */
export default function DownloadBlock({ detail, query, indicatorLabel }: Props) {
  function handleDownload() {
    if (!detail) return;

    const blob = new Blob([buildCsv(detail, query, indicatorLabel)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = csvFilename(detail, query);
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <Button
        onClick={handleDownload}
        disabled={!detail}
        variant="outline"
        className="w-full justify-center"
      >
        <Download className="size-4" />
        Download results (CSV)
      </Button>
      <p className="mt-2 text-[11px] text-slate-400">
        {detail
          ? `${detail.reaches.features.length.toLocaleString()} reaches with power and detectable improvement.`
          : "Select a catchment to enable the export."}
      </p>
    </div>
  );
}
