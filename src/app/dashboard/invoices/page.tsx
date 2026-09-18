"use client";

import * as React from "react";
import Link from "next/link";
import {
  STATUS_BADGE,
  formatDate,
  formatTtd,
  type InvoiceStatus,
} from "@/lib/invoice-line";

type Invoice = {
  invoiceNo: string;
  scope: "package" | "shipment";
  totalTtd: number;
  amountPaid: number;
  status: InvoiceStatus;
  createdAt: string;
};

function scopeLabel(scope: Invoice["scope"]): string {
  return scope.charAt(0).toUpperCase() + scope.slice(1);
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-mist/10 bg-ink-2 p-4">
      <div className="flex items-start justify-between">
        <div className="h-5 w-28 rounded bg-mist/10" />
        <div className="h-5 w-16 rounded-full bg-mist/10" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="h-3 w-24 rounded bg-mist/10" />
        <div className="h-4 w-28 rounded bg-mist/10" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <section className="flex flex-col items-center rounded-lg border border-dashed border-mist/15 px-6 py-14 text-center">
      <svg viewBox="0 0 96 96" fill="none" className="h-24 w-24" aria-hidden>
        <path
          d="M28 18h40a4 4 0 0 1 4 4v52l-8-4-8 4-8-4-8 4-8-4-8 4V22a4 4 0 0 1 4-4Z"
          className="fill-ink-2 stroke-mist/20"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M36 34h24M36 44h24M36 54h14"
          className="stroke-mist/25"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="66" cy="56" r="2.5" className="fill-[#00FF40]/60" />
      </svg>
      <p className="mt-4 text-sm font-semibold text-mist">No invoices yet</p>
      <p className="mt-1 max-w-[16rem] text-xs text-muted-dark">
        Invoices for your shipments will show up here once they&rsquo;re
        generated.
      </p>
    </section>
  );
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = React.useState<Invoice[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/invoices")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setInvoices(data.invoices);
      })
      .catch(() => {
        if (!cancelled)
          setError("Couldn't load your invoices. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sb-disp text-xl text-mist">Invoices</h1>

      {error && (
        <div role="alert" className="rounded-md bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!invoices && !error && (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      )}

      {invoices && invoices.length === 0 && <EmptyState />}

      {invoices &&
        invoices.map((inv) => {
          const badge = STATUS_BADGE[inv.status] ?? STATUS_BADGE.unpaid;
          return (
            <Link
              key={inv.invoiceNo}
              href={`/dashboard/invoices/${inv.invoiceNo}`}
              className="block rounded-lg border border-mist/10 bg-ink-2 p-4 transition-colors hover:border-mist/25 active:border-green/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <p className="sb-disp text-lg text-mist">{inv.invoiceNo}</p>
                  <span className="rounded-sm bg-mist/10 px-1.5 py-0.5 text-[10px] font-semibold text-mist">
                    {scopeLabel(inv.scope)}
                  </span>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${badge.cls}`}
                >
                  {badge.label}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-dark">
                <span>{formatDate(inv.createdAt)}</span>
                <span className="ml-auto text-sm font-bold text-white">
                  {formatTtd(inv.totalTtd)}
                </span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  className="-mr-1 h-4 w-4 shrink-0 text-muted-dark"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m8.25 4.5 7.5 7.5-7.5 7.5"
                  />
                </svg>
              </div>

              {inv.status === "partial" && (
                <p className="mt-2 text-xs text-amber-300">
                  {formatTtd(inv.amountPaid)} of {formatTtd(inv.totalTtd)} paid
                </p>
              )}
            </Link>
          );
        })}
    </div>
  );
}
