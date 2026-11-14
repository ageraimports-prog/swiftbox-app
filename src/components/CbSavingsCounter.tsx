"use client";

import * as React from "react";
import { cbLifetimeSavingLine } from "@/lib/consolidatedBilling";

/**
 * "You've saved TT$X with Consolidated Billing" — the lifetime counter. Renders
 * nothing at zero. When the figure has grown since this phone last showed it, it
 * counts up from the old one (under a second; skipped for reduced motion). What
 * was last seen is a per-device convenience in localStorage, wrapped so a private
 * window or blocked storage simply shows the figure without the animation.
 */
export default function CbSavingsCounter({ ttd, swiftCode, big = false }: { ttd: number; swiftCode: string; big?: boolean }) {
  const target = Math.round((Number(ttd) || 0) * 100);
  const [shown, setShown] = React.useState(target);

  React.useEffect(() => {
    if (target <= 0) return;
    const key = `cb-savings-seen:${swiftCode}`;
    let seen = 0;
    try { seen = Math.round(Number(window.localStorage.getItem(key) ?? 0) * 100) || 0; } catch { seen = 0; }
    const remember = () => { try { window.localStorage.setItem(key, String(target / 100)); } catch { /* storage blocked */ } };
    const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (seen <= 0 || seen >= target || reduce) { setShown(target); remember(); return; }
    let raf = 0;
    const start = performance.now(), from = seen, ms = 900;
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

  const line = cbLifetimeSavingLine(shown / 100);
  if (target <= 0 || !line) return null;
  if (!big) {
    return (
      <p role="status" className="rounded-md border border-green/30 bg-green/10 px-3 py-2 text-sm font-semibold text-mist tabular-nums">
        {line}
      </p>
    );
  }
  // Big: the amount on its own line, the words around it.
  const amount = line.replace(/^You've saved /, "").replace(/ with Consolidated Billing$/, "");
  return (
    <div role="status" aria-label={cbLifetimeSavingLine(target / 100) ?? undefined} className="rounded-lg border border-green/30 bg-green/10 px-4 py-3">
      <p className="text-sm text-mist">You&rsquo;ve saved</p>
      <p className="sb-disp text-4xl tracking-tight text-green tabular-nums">{amount}</p>
      <p className="text-sm text-mist">with Consolidated Billing</p>
    </div>
  );
}
