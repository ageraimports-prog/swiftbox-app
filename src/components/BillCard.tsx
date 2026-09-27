import Link from "next/link";
import { STATUS_BADGE, formatDate, formatTtd, type InvoiceStatus } from "@/lib/invoice-line";
import { displayTitle, packagesSummary, trackingNumbers } from "@/lib/packageDisplay";
import { TrackingLine, RefText } from "@/components/PackageCard";

/** A Consolidated Bill as /api/invoices returns it. */
export type BillSummary = {
  billNo: string;
  date: string;
  /** Optional: a cached app shell can meet an older response that sent a count. */
  packageCount?: number;
  packages?: { wr: string; tracking: string; commodities: string }[] | number;
  totalTtd: number;
  dueTtd: number;
  status: InvoiceStatus;
};

/**
 * The headline of a Consolidated Bill: what it is FOR, the same way an invoice
 * card and a package card are headed — "Shoes + 4 more". The CB number is only
 * ever the small ref. With no package rows it reads "N packages", never the
 * bill number.
 */
export function billHeadline(b: Pick<BillSummary, "packages" | "packageCount">): string {
  const pkgs = Array.isArray(b.packages) ? b.packages : [];
  const title = packagesSummary(pkgs.map((p) => displayTitle(p.commodities) ?? "Package"));
  if (title) return title;
  const n = b.packageCount ?? (typeof b.packages === "number" ? b.packages : 0);
  return n === 1 ? "1 package" : n > 1 ? `${n} packages` : "Your packages";
}

/** One Consolidated Bill in the Invoices list — same hierarchy as InvoiceCard. */
export default function BillCard({ bill }: { bill: BillSummary }) {
  const badge = STATUS_BADGE[bill.status] ?? STATUS_BADGE.unpaid;
  const pkgs = Array.isArray(bill.packages) ? bill.packages : [];
  const count = bill.packageCount ?? pkgs.length;
  const numbers = pkgs.flatMap((p) => trackingNumbers(p.tracking));

  return (
    <Link
      href={`/dashboard/bills/${bill.billNo}`}
      className="block rounded-lg border border-green/25 bg-ink-2 p-4 transition-colors hover:border-green/50 active:border-green/60"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="sb-disp min-w-0 truncate text-lg text-mist">{billHeadline(bill)}</p>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {numbers[0] && <TrackingLine tracking={numbers[0]} more={numbers.length - 1} className="mt-1" />}

      <div className="mt-3 flex items-center gap-3 text-xs text-muted-dark">
        <span className="min-w-0 truncate">
          <span className="rounded-sm bg-green/15 px-1.5 py-0.5 text-[10px] font-semibold text-green">
            Consolidated Bill{count > 0 ? ` · ${count} ${count === 1 ? "package" : "packages"}` : ""}
          </span>{" "}
          · {formatDate(bill.date)}
        </span>
        <span className="ml-auto shrink-0 text-sm font-bold text-white">{formatTtd(bill.totalTtd)}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="-mr-1 h-4 w-4 shrink-0 text-muted-dark"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
      </div>

      <div className="mt-2 flex items-center gap-3">
        {bill.status === "partial" && (
          <p className="text-xs text-amber-300">
            {formatTtd(bill.totalTtd - bill.dueTtd)} of {formatTtd(bill.totalTtd)} paid
          </p>
        )}
        <RefText refCode={bill.billNo} className="ml-auto" />
      </div>
    </Link>
  );
}
