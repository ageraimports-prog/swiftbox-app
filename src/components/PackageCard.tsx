import Link from "next/link";
import { freightLabel, packageBadge } from "@/lib/status";
import type { CustomerStatusView } from "@/lib/customer-status-core";
import {
  formatTracking,
  packageIdentity,
  type Carrier,
  type TrackingNumber,
} from "@/lib/packageDisplay";

/** A package as /api/packages returns it — the fields a card reads. */
export type PackageSummary = {
  id: number;
  wr: string;
  packageCode?: string;
  transportMode?: string | null;
  tracking?: string | null;
  freight: number;
  weight: number;
  pcs: number;
  commodities: string;
  date: string;
  shipStatus: number | null;
  /**
   * Consolidated Billing: waiting for its group (R13). The API already sends a
   * waiting package's stage as In Miami with later dates nulled; the card shows
   * the waiting badge in place of any stage.
   */
  cbWaiting?: boolean;
  /** The customer said "send them" — "Being prepared for delivery", still no stage. */
  cbPreparing?: boolean;
  /** A status the office set for this package (only sent while current). Wins over the rest. */
  customerStatus?: CustomerStatusView | null;
};

/** "UPS" / "FedEx" chip before a tracking number. Only ever a certain carrier. */
export function CarrierTag({ carrier }: { carrier: Carrier }) {
  return (
    <span className="shrink-0 rounded-sm border border-mist/15 px-1 py-px text-[10px] font-bold leading-4 tracking-wide text-muted-dark">
      {carrier}
    </span>
  );
}

/**
 * The second line of every package: the carrier tracking number, middle-
 * truncated so a card never wraps; "+1" when the field holds more than one.
 * `full` shows the whole number (detail screens).
 */
export function TrackingLine({
  tracking,
  more = 0,
  full = false,
  className = "",
}: {
  tracking: TrackingNumber;
  more?: number;
  full?: boolean;
  className?: string;
}) {
  return (
    <p className={`flex min-w-0 items-center gap-1.5 ${className}`}>
      {tracking.carrier && <CarrierTag carrier={tracking.carrier} />}
      <span
        className={`min-w-0 font-mono text-[13px] font-medium tabular-nums text-mist/90 ${
          full ? "break-all" : "truncate"
        }`}
        title={tracking.number}
      >
        {full ? tracking.number : formatTracking(tracking.number)}
      </span>
      {more > 0 && (
        <span className="shrink-0 text-[11px] font-semibold text-muted-dark">+{more}</span>
      )}
    </p>
  );
}

/** "Ref WR1193" — the lowest-emphasis text on a card. */
export function RefText({ refCode, className = "" }: { refCode: string; className?: string }) {
  if (!refCode) return null;
  return <span className={`text-[11px] text-muted-dark/70 ${className}`}>Ref {refCode}</span>;
}

function formatDate(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * One package in a list (Packages, Dashboard). Headline = what it is, then the
 * tracking number, then weight · pieces · freight · date, then the small ref.
 * No tracking number → the ref takes the tracking line's place instead.
 */
export default function PackageCard({ pkg }: { pkg: PackageSummary }) {
  const meta = packageBadge(pkg.shipStatus, pkg.cbWaiting, pkg.cbPreparing, pkg.customerStatus, pkg.freight);
  // The Consolidated Billing sentence goes on its own line; any other badge is short.
  const longBadge = !!pkg.cbWaiting && !pkg.customerStatus;
  const note = pkg.customerStatus?.note ?? null;
  const id = packageIdentity(pkg);
  return (
    <Link
      href={`/dashboard/packages/${pkg.id}`}
      className="block rounded-lg border border-mist/10 bg-ink-2 p-4 transition-colors active:border-green/40"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="sb-disp min-w-0 truncate text-lg text-mist">{id.title}</p>
        {!longBadge && (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${meta.badge}`}>
            {meta.label}
          </span>
        )}
      </div>
      {/* The waiting label is a sentence — on its own line it never squeezes the
          package's name down to a few letters on a phone. */}
      {longBadge && (
        <span className={`mt-1.5 inline-block rounded-full px-2.5 py-1 text-[10px] font-bold ${meta.badge}`}>
          {meta.label}
        </span>
      )}

      {note && (
        <p className={`mt-1.5 text-xs font-medium ${pkg.customerStatus?.kind === "notice" ? "text-amber-200/90" : "text-muted-dark"}`}>{note}</p>
      )}

      {id.tracking ? (
        <TrackingLine tracking={id.tracking} more={id.moreTracking} className="mt-1" />
      ) : (
        id.ref && <p className="mt-1 text-[13px] font-medium text-muted-dark">Ref {id.ref}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-dark">
        <span>
          <span className="font-semibold text-mist">{pkg.weight}</span> lb
        </span>
        <span>
          <span className="font-semibold text-mist">{pkg.pcs}</span> {pkg.pcs === 1 ? "pc" : "pcs"}
        </span>
        <span className="rounded-sm bg-mist/10 px-1.5 py-0.5 font-semibold text-mist">
          {freightLabel(pkg.freight, pkg.transportMode)}
        </span>
        <span>{formatDate(pkg.date)}</span>
        {id.tracking && <RefText refCode={id.ref} className="ml-auto" />}
      </div>
    </Link>
  );
}
