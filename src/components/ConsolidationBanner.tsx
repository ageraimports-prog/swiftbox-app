"use client";

import * as React from "react";

type State = {
  optedIn: boolean;
  group: { arrived: number; total: number; deliverBy: string } | null;
};

/**
 * "Held for consolidation · 2 of 3 arrived · delivers by Mon 6 Oct" with the
 * "Deliver what's here now" button. Renders nothing unless packages are held.
 * `onReleased` lets a page refresh its own package list afterwards.
 */
export default function ConsolidationBanner({ onReleased }: { onReleased?: () => void }) {
  const [state, setState] = React.useState<State | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    fetch("/api/consolidation")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setState(d))
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function release() {
    if (!window.confirm("Deliver the packages that have arrived now? Anything still on the way will be billed and delivered separately.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/consolidation/release", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't release your packages.");
      setDone("Released — we'll send one invoice and schedule a single delivery.");
      setState(data);
      onReleased?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't release your packages.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green/40 bg-green/10 px-4 py-3 text-sm text-mist">{done}</div>
    );
  }
  const g = state?.group;
  if (!g) return null;

  return (
    <section className="rounded-lg border border-violet-400/40 bg-violet-500/10 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-violet-300">Consolidated Billing</p>
      <p className="mt-1 text-sm font-semibold text-mist">
        Held for consolidation · {g.arrived} of {g.total} arrived{g.deliverBy ? ` · delivers by ${g.deliverBy}` : ""}
      </p>
      <p className="mt-1 text-xs text-muted-dark">
        We&apos;re holding what&apos;s arrived until the rest gets here, then we&apos;ll bill it as one and deliver in a
        single trip.
      </p>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      <button
        type="button"
        onClick={release}
        disabled={busy}
        className="mt-3 w-full rounded-lg bg-green px-4 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-green-deep disabled:opacity-60"
      >
        {busy ? "Releasing…" : "Deliver what's here now"}
      </button>
    </section>
  );
}
