"use client";

import * as React from "react";
import { formatTtd } from "@/lib/invoice-line";

/**
 * "Pay all open invoices" with PayPal, as ONE payment (admin CARD_DISCOUNT_PLAN.md).
 * Shown on the invoices list only when the admin says 2+ open invoices can be paid
 * together right now. The admin picks the invoices, adds them up and works out any
 * discount; this card only shows the figures it is given and never computes one.
 * Full-page redirect to PayPal (no popup), back through /pay/paypal/return.
 */
type PayAll = { available: boolean; totalTtd: number; discountTtd: number; pct: string | null; payTtd: number; payUsd: number; fxLine: string };
type Answer = { payAll: PayAll | null; termsVersion?: string; termsUrl?: string; refundPolicyUrl?: string; fxNote?: string; mode?: string };

const usd = (n: number) => `US$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function PayAllCard() {
  const [a, setA] = React.useState<Answer | null>(null);
  const [agreed, setAgreed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/invoices/pay-all")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Answer | null) => {
        if (!cancelled && d) setA(d);
      })
      .catch(() => undefined);
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", onShow);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onShow);
    };
  }, []);

  // The invoice email's "pay all your open invoices" button opens /dashboard/invoices?pay=all: bring this card into view.
  const ref = React.useRef<HTMLElement | null>(null);
  const shown = !!a?.payAll?.available;
  React.useEffect(() => {
    if (!shown) return;
    try {
      if (new URLSearchParams(window.location.search).get("pay") === "all") ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      /* no scroll is fine */
    }
  }, [shown]);

  const p = a?.payAll;
  if (!p?.available) return null;

  async function go() {
    if (!agreed || !a?.termsVersion) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices/pay-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms: { version: a.termsVersion, accepted: true } }),
      });
      const d = (await res.json().catch(() => ({}))) as { ok?: boolean; approveUrl?: string; error?: string };
      if (!res.ok || !d.ok || !d.approveUrl) {
        setError(d.error || "Couldn't start the PayPal payment. Please try again.");
        setBusy(false);
        return;
      }
      window.location.assign(d.approveUrl);
    } catch {
      setError("Couldn't start the PayPal payment. Please try again.");
      setBusy(false);
    }
  }

  return (
    <section id="pay-all" ref={ref} className="scroll-mt-4 rounded-lg border border-green/30 bg-ink-2 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-dark">Pay all open invoices</p>
      <p className="mt-1 text-sm text-muted">Every open invoice on one PayPal payment.</p>
      <p className="mt-2 text-base font-bold text-mist">{p.fxLine}</p>
      {p.discountTtd > 0 && (
        <p className="mt-2 rounded-md border border-green/30 bg-green/10 px-3 py-2 text-sm font-semibold text-mist">
          Pay all together and save <span className="text-green">{formatTtd(p.discountTtd)}</span>
          {p.pct ? ` (${p.pct})` : ""} — {formatTtd(p.totalTtd)} becomes {formatTtd(p.payTtd)}
        </p>
      )}
      {a?.fxNote && <p className="mt-1 text-xs text-muted-dark">{a.fxNote}</p>}
      {a?.mode === "sandbox" && <p className="mt-1 text-[11px] font-bold uppercase text-amber-300">Test mode — no real money moves</p>}
      <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-mist">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 accent-green" />
        <span>
          I agree to the{" "}
          <a href={a?.termsUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-green underline">
            Terms
          </a>{" "}
          and{" "}
          <a href={a?.refundPolicyUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-green underline">
            Refund Policy
          </a>
          .
        </span>
      </label>
      {error && (
        <div role="alert" className="mt-3 rounded-md bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      <button
        type="button"
        disabled={!agreed || busy}
        onClick={go}
        className="mt-4 w-full rounded-lg bg-[#FFC439] px-4 py-3 text-sm font-bold text-[#003087] transition-colors hover:bg-[#f2b72f] disabled:opacity-60"
      >
        {busy ? "Taking you to PayPal…" : `Pay all with PayPal — ${usd(p.payUsd)}`}
      </button>
      <p className="mt-2 text-center text-[11px] text-muted-dark">You&rsquo;ll go to PayPal to pay, then come straight back here. Or pay the driver in cash on delivery.</p>
    </section>
  );
}
