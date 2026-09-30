import Link from "next/link";
import type { PickPackage } from "@/lib/prealert-pick";

/** One package already at our warehouse and waiting for its pre-alert. */
export default function PrealertPickCard({ pkg }: { pkg: PickPackage }) {
  return (
    <article className="rounded-lg border border-mist/10 bg-ink-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="sb-disp text-lg leading-tight text-mist">{pkg.carrier ?? "Package"}</p>
        <span className="shrink-0 rounded-full border border-green/25 bg-green/10 px-2.5 py-1 text-[10px] font-bold text-green">
          {pkg.warehouse}
        </span>
      </div>
      <p className="mt-1 break-all text-xs text-muted-dark">{pkg.tracking}</p>
      <div className="mt-3 flex items-center gap-3">
        <div className="min-w-0 flex-1 text-xs text-muted-dark">
          <span className="font-semibold text-white">{pkg.weightLb} lb</span>
          <span className="mx-1.5">·</span>
          <span>Arrived {pkg.arrivedLabel}</span>
        </div>
        <Link
          href={`/dashboard/prealert/${pkg.pkId}`}
          className="shrink-0 rounded-lg bg-green px-4 py-2 text-sm font-bold text-ink transition-colors hover:bg-green-deep"
        >
          Pre-alert
        </Link>
      </div>
    </article>
  );
}
