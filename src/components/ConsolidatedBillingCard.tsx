"use client";

import * as React from "react";
import Link from "next/link";
import {
  CB_NAME,
  CB_LONG_DESCRIPTION,
  CB_OFF_CONFIRM,
  CB_CLOSED_CARD,
  CB_FAQ,
  HOLD_DAYS,
  SWIFTBOX_TEL,
  cbOpenCardText,
  cbBillReadyText,
  cbWhatsAppUrl,
  CB_PREPARING_TEXT,
} from "@/lib/consolidatedBilling";
import { SendNowPanel, CB_STATE_EVENT, type SendGroup } from "@/components/SendMyPackagesNow";
import { formatTtd } from "@/lib/invoice-line";

type State = {
  settingOn: boolean;
  eligible: boolean;
  swiftCode: string;
  open: { day: number; windowEnd: string } | null;
  closedWaiting: boolean;
  group: SendGroup | null;
  preparing: boolean;
  billReady: { billNo: string; dueTtd: number } | null;
};

/**
 * Consolidated Billing: the switch, where the customer's group stands, the
 * "your bill is ready" notice, and (on Account) the FAQ. Every word comes from
 * src/lib/consolidatedBilling.ts. Nothing here says where a package is (R13).
 */
export default function ConsolidatedBillingCard({
  showFaq = false,
  showSendNow = false,
}: {
  showFaq?: boolean;
  /** "Send my packages now" beside the switch (Account). The Dashboard has its own card at the top. */
  showSendNow?: boolean;
}) {
  const [state, setState] = React.useState<State | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/consolidated-billing")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setState(d))
      .catch(() => {});
    // A "Send my packages now" tap anywhere on the page moves this card too.
    const on = (e: Event) => setState((e as CustomEvent).detail as State);
    window.addEventListener(CB_STATE_EVENT, on);
    return () => window.removeEventListener(CB_STATE_EVENT, on);
  }, []);

  async function toggle() {
    if (!state) return;
    const next = !state.settingOn;
    if (!next && !window.confirm(CB_OFF_CONFIRM)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/consolidated-billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on: next }),
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

  if (!state) return null;
  const on = state.settingOn;
  const disabled = busy || (!state.eligible && !on);

  return (
    <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-dark">{CB_NAME}</p>
          <div className="mt-2 space-y-2 text-sm text-mist">
            {!on && <p>{CB_LONG_DESCRIPTION}</p>}
            {/* On the Dashboard the card at the top already says it. */}
            {showSendNow && state.preparing && <p className="font-semibold">{CB_PREPARING_TEXT}</p>}
            {on && state.open && <p>{cbOpenCardText(state.open.day, state.open.windowEnd)}</p>}
            {on && state.closedWaiting && <p>{CB_CLOSED_CARD}</p>}
            {on && !state.open && !state.closedWaiting && (
              <p>
                Consolidated Billing is on. Free. Your {HOLD_DAYS} days start when your first package arrives at our Miami
                warehouse.
              </p>
            )}
            {!on && state.closedWaiting && <p>{CB_CLOSED_CARD}</p>}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={CB_NAME}
          onClick={toggle}
          disabled={disabled}
          className={`relative mt-1 inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
            on ? "bg-green" : "bg-mist/20"
          }`}
        >
          <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
        </button>
      </div>

      {showSendNow && state.group && (
        <div className="mt-4 border-t border-mist/10 pt-4">
          <SendNowPanel key={state.group.groupId} group={state.group} onDone={(d) => setState(d as State)} />
        </div>
      )}

      {state.billReady && (
        <Link
          href={`/dashboard/bills/${state.billReady.billNo}`}
          className="mt-3 flex items-center justify-between rounded-lg border border-green/30 bg-green/10 px-3 py-2 text-sm text-mist"
        >
          <span>{cbBillReadyText(state.billReady.billNo)}</span>
          <span className="font-bold text-green">{formatTtd(state.billReady.dueTtd)}</span>
        </Link>
      )}

      {!on && state.eligible && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <a
            href={cbWhatsAppUrl(state.swiftCode)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center rounded-lg bg-green px-3 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-green-deep"
          >
            WhatsApp
          </a>
          <a
            href={SWIFTBOX_TEL}
            className="flex items-center justify-center rounded-lg border border-green/40 bg-ink px-3 py-2.5 text-sm font-bold text-green transition-colors hover:border-green hover:bg-green/5"
          >
            Call
          </a>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}

      {showFaq && (
        <div className="mt-4 border-t border-mist/10 pt-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-dark">Questions</p>
          {CB_FAQ.map((f) => (
            <details key={f.q} className="border-b border-mist/10 py-2 last:border-b-0">
              <summary className="cursor-pointer text-sm font-medium text-mist">{f.q}</summary>
              <p className="mt-1 text-xs text-muted-dark">{f.a}</p>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
