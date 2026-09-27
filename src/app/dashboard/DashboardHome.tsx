"use client";

import * as React from "react";
import Link from "next/link";
import ConsolidatedBillingCard from "@/components/ConsolidatedBillingCard";
import PackageCard, { type PackageSummary } from "@/components/PackageCard";
import InvoiceCard, { type InvoiceSummary } from "@/components/InvoiceCard";

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

export default function DashboardHome() {
  const [packages, setPackages] = React.useState<PackageSummary[] | null>(null);
  const [invoices, setInvoices] = React.useState<InvoiceSummary[] | null>(null);
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
      <ConsolidatedBillingCard />

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
