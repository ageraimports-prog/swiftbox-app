"use client";

import * as React from "react";
import Link from "next/link";

type PreAlert = {
  id: number;
  storeName: string;
  trackingNumber: string;
  freightType: "AIR" | "SEA";
  invoiceValueUsd: number;
  status: "pending" | "received" | "processed";
  createdAt: string;
};

const STATUS_BADGE: Record<PreAlert["status"], { label: string; cls: string }> = {
  pending: {
    label: "Pending",
    cls: "bg-amber-400/10 text-amber-300 border border-amber-400/25",
  },
  received: {
    label: "Received",
    cls: "bg-sky-400/10 text-sky-300 border border-sky-400/25",
  },
  processed: {
    label: "Processed",
    cls: "bg-green/10 text-green border border-green/25",
  },
};

function formatUsd(amount: number): string {
  return `USD $${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(ts: string): string {
  const d = new Date(ts.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-lg border border-mist/10 bg-ink-2 p-4">
      <div className="flex items-start justify-between">
        <div className="h-5 w-32 rounded bg-mist/10" />
        <div className="h-5 w-16 rounded-full bg-mist/10" />
      </div>
      <div className="mt-3 h-3 w-40 rounded bg-mist/10" />
      <div className="mt-4 flex items-center justify-between">
        <div className="h-4 w-20 rounded bg-mist/10" />
        <div className="h-3 w-16 rounded bg-mist/10" />
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <section className="flex flex-col items-center rounded-lg border border-dashed border-mist/15 px-6 py-14 text-center">
      <svg viewBox="0 0 96 96" fill="none" className="h-24 w-24" aria-hidden>
        <path
          d="M48 22a14 14 0 0 0-14 14v6c0 5-2 9.8-5.5 13.3L26 64h44l-2.5-8.7A18.8 18.8 0 0 1 62 42v-6a14 14 0 0 0-14-14Z"
          className="fill-ink-2 stroke-mist/20"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M42 70a6 6 0 0 0 12 0"
          className="stroke-mist/20"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="M48 14v3" className="stroke-mist/20" strokeWidth="2" strokeLinecap="round" />
        <circle cx="66" cy="30" r="9" className="fill-[#00FF40]" />
        <path
          d="M66 26.5v7M62.5 30h7"
          className="stroke-ink"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
      <p className="mt-4 text-sm font-semibold text-mist">No pre-alerts yet</p>
      <p className="mt-1 max-w-[18rem] text-xs text-muted-dark">
        Tell us about a package before it arrives so we can match it the moment
        it lands in Miami.
      </p>
      <Link
        href="/dashboard/prealerts/new"
        className="mt-5 flex items-center gap-1.5 rounded-xl bg-green px-5 py-3 text-sm font-bold text-ink transition-colors hover:bg-green-deep"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          className="h-4 w-4"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Submit one below
      </Link>
    </section>
  );
}

export default function PreAlertsPage() {
  const [prealerts, setPrealerts] = React.useState<PreAlert[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/prealerts")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setPrealerts(data.prealerts);
      })
      .catch(() => {
        if (!cancelled)
          setError("Couldn't load your pre-alerts. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasItems = prealerts != null && prealerts.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sb-disp text-xl text-mist">Pre-alerts</h1>

      {error && (
        <div role="alert" className="rounded-md bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!prealerts && !error && (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      )}

      {prealerts && prealerts.length === 0 && <EmptyState />}

      {prealerts?.map((pa) => {
        const badge = STATUS_BADGE[pa.status] ?? STATUS_BADGE.pending;
        return (
          <article
            key={pa.id}
            className="rounded-lg border border-mist/10 bg-ink-2 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="sb-disp text-lg leading-tight text-mist">
                {pa.storeName}
              </p>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${badge.cls}`}
              >
                {badge.label}
              </span>
            </div>

            <p className="mt-1 break-all text-xs text-muted-dark">
              {pa.trackingNumber}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-dark">
              <span className="rounded-sm bg-mist/10 px-1.5 py-0.5 font-semibold text-mist">
                {pa.freightType}
              </span>
              <span className="font-semibold text-white">
                {formatUsd(pa.invoiceValueUsd)}
              </span>
              <span className="ml-auto">{formatDate(pa.createdAt)}</span>
            </div>
          </article>
        );
      })}

      {/* Floating + button — empty state has its own CTA, so only show with items */}
      {hasItems && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-10 mx-auto flex max-w-md justify-end px-5">
          <Link
            href="/dashboard/prealerts/new"
            aria-label="New pre-alert"
            className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-green shadow-lg shadow-green/30 transition-colors hover:bg-green-deep"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              className="h-6 w-6 text-ink"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </Link>
        </div>
      )}
    </div>
  );
}
