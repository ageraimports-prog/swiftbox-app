"use client";

import * as React from "react";
import { formatTtd } from "@/lib/invoice-line";

/**
 * "Your savings" on the Dashboard (admin CARD_DISCOUNT_PLAN.md): the lifetime total
 * in TT$, split into Card savings (paying online) and Consolidated Billing savings,
 * with the most recent saving and its date. Figures are the admin's own records,
 * read by src/lib/customer-savings.ts — nothing here is worked out or estimated.
 *
 * The first time the app is opened after a new saving, the total counts up from the
 * figure this phone last showed (under a second; skipped for reduced motion). What
 * was last seen is a per-device convenience in localStorage, wrapped so a private
 * window or blocked storage simply shows the figure.
 */
export type SavingsView = {
  totalTtd: number;
  cardTtd: number;
  cbTtd: number;
  latest: { type: "card" | "consolidated"; amountTtd: number; at: string } | null;
};

function dateText(at: string): string {
  const d = new Date(at.length <= 10 ? `${at}T12:00:00Z` : at);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-TT", { timeZone: "America/Port_of_Spain", day: "numeric", month: "short", year: "numeric" });
}

export default function YourSavingsCard({ savings, swiftCode }: { savings: SavingsView; swiftCode: string }) {
  const target = Math.round((Number(savings.totalTtd) || 0) * 100);
  const [shown, setShown] = React.useState(target);

  React.useEffect(() => {
    if (target <= 0) return;
    const key = `savings-seen:${swiftCode}`;
    let seen = -1;
    try {
      const raw = window.localStorage.getItem(key);
      seen = raw === null ? 0 : Math.round(Number(raw) * 100) || 0;
    } catch {
      seen = -1;
    }
    const remember = () => {
      try {
        window.localStorage.setItem(key, String(target / 100));
      } catch {
        /* storage blocked */
      }
    };
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (seen < 0 || seen >= target || reduce) {
      setShown(target);
      remember();
      return;
    }
    let raf = 0;
    const start = performance.now();
    const from = seen;
    const ms = 900;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(step);
      else remember();
    };
    setShown(from);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, swiftCode]);

  if (target <= 0) return null;
  const latest = savings.latest;
  return (
    <section aria-label={`Your savings: ${formatTtd(target / 100)}`} className="relative overflow-hidden rounded-lg border border-green/30 bg-ink-2 p-5">
      <div className="sb-glow absolute -top-16 -right-16 h-48 w-48" aria-hidden />
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-dark">Your savings</p>
      <p className="sb-disp mt-2 text-5xl tracking-tight text-green tabular-nums" role="status">
        {formatTtd(shown / 100)}
      </p>
      <p className="mt-1 text-sm text-mist">saved with Swiftbox</p>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-md border border-mist/10 bg-ink px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wider text-muted-dark">Card savings</dt>
          <dd className="mt-0.5 text-base font-bold text-mist tabular-nums">{formatTtd(savings.cardTtd)}</dd>
        </div>
        <div className="rounded-md border border-mist/10 bg-ink px-3 py-2">
          <dt className="text-[11px] uppercase tracking-wider text-muted-dark">Consolidated Billing savings</dt>
          <dd className="mt-0.5 text-base font-bold text-mist tabular-nums">{formatTtd(savings.cbTtd)}</dd>
        </div>
      </dl>
      {latest && latest.amountTtd > 0 && (
        <p className="mt-3 text-xs text-muted">
          Latest: {formatTtd(latest.amountTtd)} {latest.type === "card" ? "for paying online" : "with Consolidated Billing"}
          {dateText(latest.at) ? ` · ${dateText(latest.at)}` : ""}
        </p>
      )}
    </section>
  );
}
