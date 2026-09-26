"use client";

import * as React from "react";

type State = {
  optedIn: boolean;
  holdDays: number;
  eligible: boolean;
  ineligibleReason: string | null;
  group: { arrived: number; total: number; deliverBy: string } | null;
};

/** Account → "Consolidated Billing" on/off, with the explainer. */
export default function ConsolidationToggle() {
  const [state, setState] = React.useState<State | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/consolidation")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setState(d))
      .catch(() => setError("Couldn't load Consolidated Billing."));
  }, []);

  async function toggle() {
    if (!state) return;
    const next = !state.optedIn;
    if (!next && state.group) {
      const ok = window.confirm(
        `Turn off Consolidated Billing? The ${state.group.arrived} package${state.group.arrived === 1 ? "" : "s"} we're holding will be released for delivery now.`
      );
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/consolidation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optIn: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save.");
      setState(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  const on = state?.optedIn ?? false;
  const disabled = busy || !state || (!state.eligible && !on);

  return (
    <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-dark">Consolidated Billing</p>
          <p className="mt-2 text-sm text-mist">
            We hold your packages until they&apos;ve all arrived — up to {state?.holdDays ?? 10} days — then bill them as one and deliver
            in a single trip.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Consolidated Billing"
          onClick={toggle}
          disabled={disabled}
          className={`relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            on ? "bg-green" : "bg-mist/20"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
              on ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {state && !state.eligible && <p className="mt-3 text-xs text-muted-dark">{state.ineligibleReason}</p>}
      {state?.group && (
        <p className="mt-3 text-xs text-green">
          Holding {state.group.arrived} of {state.group.total} · delivers by {state.group.deliverBy}
        </p>
      )}
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
    </section>
  );
}
