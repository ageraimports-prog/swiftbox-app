import Link from "next/link";
import { STATUS_BADGE, formatDate, formatTtd, type InvoiceStatus } from "@/lib/invoice-line";
import { formatDescription, packagesSummary, trackingNumbers } from "@/lib/packageDisplay";
import { TrackingLine } from "@/components/PackageCard";

/** An invoice as /api/invoices returns it. */
export type InvoiceSummary = {
  invoiceNo: string;
  scope: "package" | "shipment";
  totalTtd: number;
  amountPaid: number;
  status: InvoiceStatus;
  createdAt: string;
  /** What it bills for. Optional: a cached app shell can meet an older response. */
  packages?: { wr: string; tracking: string; commodities: string }[];
};

/** Headline for an invoice with no package rows — never the invoice number. */
function fallbackTitle(scope: InvoiceSummary["scope"]): string {
  return scope === "shipment" ? "Shipment charges" : "Package";
}

/**
 * One invoice in a list (Invoices, Dashboard). Leads with what it is FOR — the
 * package description and its tracking number — and keeps the invoice number,
 * which is what the PDF says, on the line below. An invoice with no package rows
 * (shipment scope) is headed by what kind of charge it is — never by its
 * invoice number, which stays the small line underneath either way.
 */
export default function InvoiceCard({ inv }: { inv: InvoiceSummary }) {
  const badge = STATUS_BADGE[inv.status] ?? STATUS_BADGE.unpaid;
  const pkgs = inv.packages ?? [];
  const title = packagesSummary(pkgs.map((p) => formatDescription(p.commodities) ?? "Package"));
  const numbers = pkgs.flatMap((p) => trackingNumbers(p.tracking));

  return (
    <Link
      href={`/dashboard/invoices/${inv.invoiceNo}`}
      className="block rounded-lg border border-mist/10 bg-ink-2 p-4 transition-colors hover:border-mist/25 active:border-green/40"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="sb-disp min-w-0 truncate text-lg text-mist">{title || fallbackTitle(inv.scope)}</p>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${badge.cls}`}>
          {badge.label}
        </span>
      </div>

      {numbers[0] && <TrackingLine tracking={numbers[0]} more={numbers.length - 1} className="mt-1" />}

      <div className="mt-3 flex items-center gap-3 text-xs text-muted-dark">
        {/* The invoice number (what the PDF says) always sits here, below the headline. */}
        <span className="min-w-0 truncate">
          <span className="font-semibold text-mist">{inv.invoiceNo}</span> · {formatDate(inv.createdAt)}
        </span>
        <span className="ml-auto shrink-0 text-sm font-bold text-white">{formatTtd(inv.totalTtd)}</span>
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

      {inv.status === "partial" && (
        <p className="mt-2 text-xs text-amber-300">
          {formatTtd(inv.amountPaid)} of {formatTtd(inv.totalTtd)} paid
        </p>
      )}
    </Link>
  );
}
