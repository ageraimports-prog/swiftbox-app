"use client";

import * as React from "react";
import Link from "next/link";
import type { BfmStatus } from "@/lib/buy-for-me-core";
import { BuyForMeRules, StatusPill, card, formatDate, greenButton, ttd } from "./ui";

type Row = {
  id: number;
  no: string;
  status: BfmStatus;
  statusLabel: string;
  itemCount: number;
  totalTtdCents: number | null;
  createdAt: string | null;
  hasUpdate: boolean;
};

export default function BuyForMePage() {
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/buy-for-me")
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => !cancelled && setRows(d.requests))
      .catch(() => !cancelled && setError("Couldn't load your requests. Please try again."));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="sb-disp text-xl text-mist">Buy For Me</h1>
        <Link href="/dashboard/buy-for-me/new" className={`${greenButton} px-4 py-2`}>
          New request
        </Link>
      </div>

      <section className={card}>
        <p className="text-sm text-mist">
          Can&apos;t buy it yourself? Send us the link and we&apos;ll buy it for you and ship it to Trinidad with your other packages.
        </p>
        <div className="mt-3">
          <BuyForMeRules />
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded-md bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!rows && !error && <div className={`${card} animate-pulse h-20`} />}

      {rows && rows.length === 0 && (
        <section className="flex flex-col items-center rounded-lg border border-dashed border-mist/15 px-6 py-12 text-center">
          <p className="text-sm font-semibold text-mist">No requests yet</p>
          <p className="mt-1 max-w-[18rem] text-xs text-muted-dark">Paste a product link and we&apos;ll send you a quote.</p>
          <Link href="/dashboard/buy-for-me/new" className={`${greenButton} mt-5`}>
            Start a request
          </Link>
        </section>
      )}

      {rows?.map((r) => (
        <Link key={r.id} href={`/dashboard/buy-for-me/${r.id}`} className={`${card} block transition-colors hover:border-mist/25`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-sm font-semibold text-mist">
                {r.no}
                {r.hasUpdate && <span className="ml-2 rounded-full bg-green px-2 py-0.5 font-sans text-[10px] font-bold uppercase text-ink">Update</span>}
              </p>
              <p className="mt-1 text-xs text-muted-dark">
                {r.itemCount} item{r.itemCount === 1 ? "" : "s"} · {formatDate(r.createdAt)}
              </p>
            </div>
            <StatusPill status={r.status} label={r.statusLabel} />
          </div>
          {r.totalTtdCents != null && <p className="mt-3 text-sm font-semibold text-mist">{ttd(r.totalTtdCents)}</p>}
        </Link>
      ))}
    </div>
  );
}
