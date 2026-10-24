"use client";

import * as React from "react";
import PackageCard, { TrackingLine, type PackageSummary } from "@/components/PackageCard";
import { trackingNumbers } from "@/lib/packageDisplay";

/** A pre-alert with no package yet (R4): the status is the shared rule's — never a count or a place beyond Miami. */
export type PrealertSummary = {
  id: number;
  tracking: string;
  storeName: string;
  description: string;
  status: { label: string; flagged: boolean };
};

function PrealertCard({ p }: { p: PrealertSummary }) {
  const [tracking] = trackingNumbers(p.tracking);
  const badge = p.status.flagged ? "bg-amber-400/15 text-amber-200 border border-amber-400/50" : "bg-mist/10 text-muted-dark border border-mist/15";
  return (
    <div className="rounded-lg border border-dashed border-mist/15 bg-ink-2 p-4" data-testid="prealert-card">
      <div className="flex items-start justify-between gap-3">
        <p className="sb-disp min-w-0 truncate text-lg text-mist">{p.description || p.storeName || "Pre-alerted package"}</p>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${badge}`}>{p.status.label}</span>
      </div>
      {tracking && <TrackingLine tracking={tracking} className="mt-1" />}
      <p className="mt-2 text-xs text-muted-dark">Pre-alert{p.storeName ? ` · ${p.storeName}` : ""}</p>
    </div>
  );
}

function SkeletonCard() {
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

function EmptyState() {
  return (
    <section className="flex flex-col items-center rounded-lg border border-dashed border-mist/15 px-6 py-14 text-center">
      <svg viewBox="0 0 96 96" fill="none" className="h-24 w-24" aria-hidden>
        <rect
          x="18"
          y="34"
          width="60"
          height="42"
          rx="6"
          className="fill-ink-2 stroke-mist/20"
          strokeWidth="2"
        />
        <path
          d="M18 46h60"
          className="stroke-mist/20"
          strokeWidth="2"
        />
        <path
          d="M42 34v12m12-12v12"
          className="stroke-mist/20"
          strokeWidth="2"
        />
        <path
          d="M48 16v8m0 0-6-5m6 5 6-5"
          className="stroke-[#00FF40]"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="70" cy="24" r="2.5" className="fill-[#00FF40]/60" />
        <circle cx="26" cy="22" r="2" className="fill-mist/30" />
      </svg>
      <p className="mt-4 text-sm font-semibold text-mist">No packages yet</p>
      <p className="mt-1 max-w-[16rem] text-xs text-muted-dark">
        Ship something to your Skybox address and it will show up here as soon
        as it reaches our Miami warehouse.
      </p>
    </section>
  );
}

export default function PackagesPage() {
  const [packages, setPackages] = React.useState<PackageSummary[] | null>(null);
  const [prealerts, setPrealerts] = React.useState<PrealertSummary[]>([]);
  const [error, setError] = React.useState<string | null>(null);


  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/packages")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) { setPackages(data.packages); setPrealerts(Array.isArray(data.prealerts) ? data.prealerts : []); }
      })
      .catch(() => {
        if (!cancelled)
          setError("Couldn't load your packages. Pull down to retry.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sb-disp text-xl text-mist">Packages</h1>


      {error && (
        <div role="alert" className="rounded-md bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!packages && !error && (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      )}

      {packages && packages.length === 0 && prealerts.length === 0 && <EmptyState />}

      {packages && prealerts.map((p) => <PrealertCard key={`pre-${p.id}`} p={p} />)}

      {packages?.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} />)}
    </div>
  );
}
