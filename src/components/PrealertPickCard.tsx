import Link from "next/link";
import type { PickPackage } from "@/lib/prealert-pick";
import { packageIdentity } from "@/lib/packageDisplay";
import { RefText, TrackingLine } from "@/components/PackageCard";

/**
 * One package already at our warehouse and waiting for its pre-alert. Same
 * hierarchy as every package card — what it is, then the tracking number — except
 * that before the customer has described it, the store it came from ("Amazon")
 * is a better headline than "Package".
 */
export default function PrealertPickCard({ pkg }: { pkg: PickPackage }) {
  const id = packageIdentity({
    commodities: pkg.description,
    tracking: pkg.tracking,
    wr: pkg.wr,
    fallbackTitle: pkg.carrier,
  });
  const fromStore = pkg.description && pkg.carrier ? pkg.carrier : null;
  return (
    <article className="rounded-lg border border-mist/10 bg-ink-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="sb-disp min-w-0 truncate text-lg leading-tight text-mist">{id.title}</p>
        <span className="shrink-0 rounded-full border border-green/25 bg-green/10 px-2.5 py-1 text-[10px] font-bold text-green">
          {pkg.warehouse}
        </span>
      </div>
      {id.tracking && <TrackingLine tracking={id.tracking} more={id.moreTracking} className="mt-1" />}
      <div className="mt-3 flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-xs text-muted-dark">
          <span className="truncate">
            <span className="font-semibold text-white">{pkg.weightLb} lb</span>
            <span className="mx-1.5">·</span>
            <span>Arrived {pkg.arrivedLabel}</span>
          </span>
          <span className="truncate">
            {fromStore && <span className="text-[11px] text-muted-dark">From {fromStore} · </span>}
            <RefText refCode={id.ref} />
          </span>
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
