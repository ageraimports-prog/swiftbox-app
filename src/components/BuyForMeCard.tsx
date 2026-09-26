"use client";

import * as React from "react";
import Link from "next/link";

/**
 * Dashboard card for Buy For Me, with an "N updates" badge (a status change the
 * customer hasn't opened yet — e.g. a quote is ready). Secondary to the page:
 * if the counts can't load, the card still links through.
 */
export default function BuyForMeCard() {
  const [c, setC] = React.useState<{ open: number; updates: number } | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/buy-for-me/summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => !cancelled && d && setC(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      href="/dashboard/buy-for-me"
      className="relative block overflow-hidden rounded-lg border border-mist/10 bg-ink-2 p-5 transition-colors hover:border-mist/25"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-dark">Buy For Me</p>
          <p className="mt-2 text-base font-semibold text-mist">We&apos;ll buy it for you</p>
          <p className="mt-1 text-xs text-muted-dark">
            Send us a product link — we quote, you pay by bank transfer, we buy and ship it with your packages.
          </p>
        </div>
        {c && c.updates > 0 && (
          <span className="shrink-0 rounded-full bg-green px-2.5 py-1 text-xs font-bold text-ink">
            {c.updates} update{c.updates === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {c && c.open > 0 && (
        <p className="mt-3 text-xs text-mist">
          {c.open} open request{c.open === 1 ? "" : "s"}
        </p>
      )}
    </Link>
  );
}
