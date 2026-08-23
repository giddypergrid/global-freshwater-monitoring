import type { Metadata } from "next";
import Link from "next/link";
import ToolShell from "@/components/tool/ToolShell";

export const metadata: Metadata = {
  title: "Rivers · Global Freshwater Monitoring Design",
  description:
    "Detection power for water quality improvement in rivers, by catchment and monitoring design.",
};

export default function ToolPage() {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
        <div>
          <Link href="/" className="text-sm font-semibold text-slate-900">
            Global Freshwater Monitoring Design
          </Link>
          <p className="text-xs text-slate-500">
            Detecting water quality improvement in rivers
          </p>
        </div>
        <Link
          href="/"
          className="text-xs text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline"
        >
          About
        </Link>
      </header>

      <div className="min-h-0 flex-1">
        <ToolShell />
      </div>
    </div>
  );
}
