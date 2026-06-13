"use client";

import * as React from "react";
import Link from "next/link";
import { stageMeta, freightLabel } from "@/lib/status";

type Pkg = {
  id: number;
  wr: string;
  freight: number;
  weight: number;
  pcs: number;
  commodities: string;
  date: string;
  shipStatus: number | null;
};

type Invoice = {
  invoiceNo: string;
  scope: "package" | "shipment";
  totalTtd: number;
  amountPaid: number;
  status: "unpaid" | "partial" | "paid";
  createdAt: string;
};

const INVOICE_BADGE: Record<Invoice["status"], { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-green/10 text-green border border-green/25" },
  partial: { label: "Partial", cls: "bg-amber-400/10 text-amber-300 border border-amber-400/25" },
  unpaid: { label: "Unpaid", cls: "bg-amber-400/10 text-amber-300 border border-amber-400/25" },
};

/** Handles both date-only (packages) and datetime (invoices) strings. */
function formatDate(s: string): string {
  const iso = s.includes(" ") ? s.replace(" ", "T") : `${s}T00:00:00`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTtd(amount: number): string {
  return `TTD $${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function scopeLabel(scope: Invoice["scope"]): string {
  return scope.charAt(0).toUpperCase() + scope.slice(1);
}

function SectionHeading({
  title,
  href,
}: {
  title: string;
  href?: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="sb-disp text-lg text-mist">{title}</h2>
      {href && (
        <Link
          href={href}
          className="text-sm font-semibold text-green transition-colors hover:text-green-deep"
        >
          View all
        </Link>
      )}
    </div>
  );
}

function PackageSkeleton() {
  return (
    <div className="animate-pulse rounded-lg border border-mist/10 bg-ink-2 p-4">
      <div className="flex items-start justify-between">
        <div className="h-5 w-24 rounded bg-mist/10" />
        <div className="h-5 w-20 rounded-full bg-mist/10" />
      </div>
      <div className="mt-3 h-4 w-3/4 rounded bg-mist/10" />
      <div className="mt-4 flex gap-4">
        <div className="h-3 w-14 rounded bg-mist/10" />
        <div className="h-3 w-14 rounded bg-mist/10" />
        <div className="h-3 w-20 rounded bg-mist/10" />
      </div>
    </div>
  );
}

function PackageCard({ pkg }: { pkg: Pkg }) {
  const meta = stageMeta(pkg.shipStatus);
  return (
    <Link
      href={`/dashboard/packages/${pkg.id}`}
      className="block rounded-lg border border-mist/10 bg-ink-2 p-4 transition-colors active:border-green/40"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="sb-disp text-lg text-mist">{pkg.wr}</p>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${meta.badge}`}>
          {meta.label}
        </span>
      </div>
      {pkg.commodities && (
        <p className="mt-1 line-clamp-1 text-sm text-muted-dark">{pkg.commodities}</p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-dark">
        <span>
          <span className="font-semibold text-mist">{pkg.weight}</span> lb
        </span>
        <span>
          <span className="font-semibold text-mist">{pkg.pcs}</span>{" "}
          {pkg.pcs === 1 ? "pc" : "pcs"}
        </span>
        <span className="rounded-sm bg-mist/10 px-1.5 py-0.5 font-semibold text-mist">
          {freightLabel(pkg.freight)}
        </span>
        <span className="ml-auto">{formatDate(pkg.date)}</span>
      </div>
    </Link>
  );
}

function InvoiceCard({ inv }: { inv: Invoice }) {
  const badge = INVOICE_BADGE[inv.status] ?? INVOICE_BADGE.unpaid;
  return (
    <div className="rounded-lg border border-mist/10 bg-ink-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="sb-disp text-lg text-mist">{inv.invoiceNo}</p>
          <span className="rounded-sm bg-mist/10 px-1.5 py-0.5 text-[10px] font-semibold text-mist">
            {scopeLabel(inv.scope)}
          </span>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-dark">
        <span>{formatDate(inv.createdAt)}</span>
        <span className="text-sm font-bold text-white">{formatTtd(inv.totalTtd)}</span>
      </div>
      {inv.status === "partial" && (
        <p className="mt-2 text-xs text-amber-300">
          {formatTtd(inv.amountPaid)} of {formatTtd(inv.totalTtd)} paid
        </p>
      )}
    </div>
  );
}

export default function DashboardHome() {
  const [packages, setPackages] = React.useState<Pkg[] | null>(null);
  const [invoices, setInvoices] = React.useState<Invoice[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/packages").then((r) => {
        if (!r.ok) throw new Error(`packages ${r.status}`);
        return r.json();
      }),
      fetch("/api/invoices").then((r) => {
        if (!r.ok) throw new Error(`invoices ${r.status}`);
        return r.json();
      }),
    ])
      .then(([pkgData, invData]) => {
        if (cancelled) return;
        setPackages(pkgData.packages);
        setInvoices(invData.invoices);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your dashboard. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const recentPackages = packages?.slice(0, 3) ?? [];
  const recentInvoices = invoices?.slice(0, 2) ?? [];

  return (
    <>
      {/* Recent Packages */}
      <section>
        <SectionHeading title="Recent Packages" href="/dashboard/packages" />
        <div className="flex flex-col gap-3">
          {error && (
            <div role="alert" className="rounded-md bg-red-400/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {!packages && !error && (
            <>
              <PackageSkeleton />
              <PackageSkeleton />
              <PackageSkeleton />
            </>
          )}

          {packages && packages.length === 0 && (
            <div className="rounded-lg border border-dashed border-mist/15 px-6 py-8 text-center text-sm text-muted-dark">
              No packages yet
            </div>
          )}

          {recentPackages.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} />
          ))}
        </div>
      </section>

      {/* Quick Actions */}
      <section>
        <h2 className="sb-disp mb-3 text-lg text-mist">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/dashboard/prealerts/new"
            className="flex items-center justify-center gap-2 rounded-lg bg-green px-4 py-3 text-sm font-bold text-ink transition-colors hover:bg-green-deep"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
              />
            </svg>
            Pre-alert
          </Link>
          <Link
            href="/dashboard/account"
            className="flex items-center justify-center gap-2 rounded-lg border border-green/40 bg-ink px-4 py-3 text-sm font-bold text-green transition-colors hover:border-green hover:bg-green/5"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-5 w-5" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
            </svg>
            My Address
          </Link>
        </div>
      </section>

      {/* Invoices summary — only when there are invoices */}
      {invoices && invoices.length > 0 && (
        <section>
          <SectionHeading title="Invoices" href="/dashboard/invoices" />
          <div className="flex flex-col gap-3">
            {recentInvoices.map((inv) => (
              <InvoiceCard key={inv.invoiceNo} inv={inv} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
