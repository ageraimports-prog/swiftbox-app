"use client";

import * as React from "react";
import {
  CB_NAME,
  CB_PREPARING_TEXT,
  CB_SEND_NOW_BUTTON,
  CB_SEND_NOW_HINT,
  cbSendNowConfirmText,
  cbWaitingSummary,
} from "@/lib/consolidatedBilling";
import { formatDescription, trackingNumbers } from "@/lib/packageDisplay";
import { TrackingLine } from "@/components/PackageCard";

/** The open group as /api/consolidated-billing returns it. */
export type SendGroup = {
  groupId: number;
  packages: { commodities: string; tracking: string; wr: string }[];
  daysLeft: number;
};

/** The slice of the Consolidated Billing state these pieces read. */
export type SendState = { group: SendGroup | null; preparing: boolean };

/**
 * Every "Send my packages now" on screen listens for this, so a tap on the
 * Dashboard's card also updates the Consolidated Billing card further down.
 */
export const CB_STATE_EVENT = "cb-state-changed";

function announce(state: unknown) {
  window.dispatchEvent(new CustomEvent(CB_STATE_EVENT, { detail: state }));
}

/**
 * The button, its confirmation and what follows — the group described by what
 * the packages ARE (description + tracking), never by WR/SWF, and never where
 * they are (R13). The admin owns the rule; a double tap answers "already".
 */
export function SendNowPanel({ group, onDone }: { group: SendGroup; onDone?: (state: unknown) => void }) {
  const [step, setStep] = React.useState<"idle" | "confirm" | "busy" | "done" | "already">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const titles = group.packages.map((p) => formatDescription(p.commodities) ?? "Package");
  const count = group.packages.length;

  async function send() {
    if (step === "busy") return;
    setStep("busy");
    setError(null);
    try {
      const res = await fetch("/api/consolidated-billing/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId: group.groupId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Couldn't send your packages. Please try again.");
      setStep(data.already ? "already" : "done");
      if (data.state) {
        onDone?.(data.state);
        announce(data.state);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send your packages. Please try again.");
      setStep("confirm");
    }
  }

  if (step === "done" || step === "already") {
    return (
      <p role="status" className="rounded-lg border border-green/30 bg-green/10 px-3 py-2.5 text-sm font-semibold text-mist">
        {step === "already" ? "Already on its way. " : ""}
        {CB_PREPARING_TEXT}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="break-words text-sm font-semibold text-mist">{cbWaitingSummary(titles)}</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {group.packages.slice(0, 4).map((p, i) => {
            const num = trackingNumbers(p.tracking)[0];
            return (
              <li key={`${p.wr}-${i}`} className="min-w-0">
                <p className="truncate text-xs text-muted-dark">{titles[i]}</p>
                {num && <TrackingLine tracking={num} className="text-[12px]" />}
              </li>
            );
          })}
          {count > 4 && <li className="text-xs text-muted-dark">+{count - 4} more</li>}
        </ul>
        <p className="mt-2 text-xs text-muted-dark">{CB_SEND_NOW_HINT}</p>
      </div>

      {step === "idle" && (
        <button
          type="button"
          onClick={() => setStep("confirm")}
          className="w-full rounded-lg bg-green px-4 py-3 text-sm font-bold text-ink transition-colors hover:bg-green-deep"
        >
          {CB_SEND_NOW_BUTTON}
        </button>
      )}

      {(step === "confirm" || step === "busy") && (
        <div role="alertdialog" aria-label={CB_SEND_NOW_BUTTON} className="rounded-lg border border-green/30 bg-ink p-3">
          <p className="text-sm text-mist">{cbSendNowConfirmText(count)}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setStep("idle")}
              disabled={step === "busy"}
              className="rounded-lg border border-mist/20 px-3 py-2.5 text-sm font-semibold text-mist disabled:opacity-50"
            >
              Not yet
            </button>
            <button
              type="button"
              onClick={send}
              disabled={step === "busy"}
              className="rounded-lg bg-green px-3 py-2.5 text-sm font-bold text-ink disabled:opacity-60"
            >
              {step === "busy" ? "Sending…" : "Yes, send them"}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}

/**
 * A card of its own — the top of the Dashboard and a waiting package's detail
 * page. Shows only when the customer has an OPEN group with at least one
 * package, or (after the tap) the "being prepared" line.
 */
export default function SendMyPackagesNow({ className = "" }: { className?: string }) {
  const [state, setState] = React.useState<SendState | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/consolidated-billing")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setState(d); })
      .catch(() => {});
    const on = (e: Event) => setState((e as CustomEvent).detail as SendState);
    window.addEventListener(CB_STATE_EVENT, on);
    return () => {
      cancelled = true;
      window.removeEventListener(CB_STATE_EVENT, on);
    };
  }, []);

  if (!state || (!state.group && !state.preparing)) return null;
  return (
    <section className={`rounded-lg border border-green/30 bg-ink-2 p-4 ${className}`}>
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-dark">{CB_NAME}</p>
      <div className="mt-2">
        {state.group ? (
          <SendNowPanel key={state.group.groupId} group={state.group} />
        ) : (
          <p role="status" className="text-sm font-semibold text-mist">{CB_PREPARING_TEXT}</p>
        )}
      </div>
    </section>
  );
}
