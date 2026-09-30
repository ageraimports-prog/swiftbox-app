"use client";

import * as React from "react";
import ConsolidationBanner from "@/components/ConsolidationBanner";
import PackageCard, { type PackageSummary } from "@/components/PackageCard";

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
  const [error, setError] = React.useState<string | null>(null);

  const [reload, setReload] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/packages")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setPackages(data.packages);
      })
      .catch(() => {
        if (!cancelled)
          setError("Couldn't load your packages. Pull down to retry.");
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sb-disp text-xl text-mist">Packages</h1>

      <ConsolidationBanner onReleased={() => setReload((n) => n + 1)} />

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

      {packages && packages.length === 0 && <EmptyState />}

      {packages?.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} />)}
    </div>
  );
}
