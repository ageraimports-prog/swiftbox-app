"use client";

import * as React from "react";
import Link from "next/link";
import {
  CB_NAME,
  CB_LONG_DESCRIPTION,
  CB_EXISTING_INCLUDED,
  cbEnrolledText,
  CB_OFF_CONFIRM,
  CB_CLOSED_CARD,
  CB_FAQ,
  SWIFTBOX_TEL,
  CB_ON_TEXT,
  cbBillReadyText,
  cbWhatsAppUrl,
  CB_PREPARING_TEXT,
  CB_DASH_HEADLINE,
  CB_DASH_PITCH,
  CB_DASH_MULTI_ONLY,
} from "@/lib/consolidatedBilling";
import { SendNowPanel, CB_STATE_EVENT, type SendGroup } from "@/components/SendMyPackagesNow";
import CbSavingsCounter from "@/components/CbSavingsCounter";
import { formatTtd } from "@/lib/invoice-line";
import { TOBAGO_DELIVERY_SHORT, TOBAGO_DELIVERY_LONG, TOBAGO_DELIVERY_FAQ_Q } from "@/lib/tobago-delivery";

type State = {
  settingOn: boolean;
  eligible: boolean;
  swiftCode: string;
  open: { day: number; windowEnd: string } | null;
  closedWaiting: boolean;
  group: SendGroup | null;
  preparing: boolean;
  billReady: { billNo: string; dueTtd: number } | null;
  /** Delivered in Tobago (users.zone, else the address) — only then the Tobago delivery line shows. */
  tobago?: boolean;
  sendNowMessage?:string;
  /** Lifetime Consolidated Billing saving, TT$ (src/lib/cb-savings.ts). 0 / null / missing → no counter. */
  savingsTtd?: number | null;
};

/** Which of the Dashboard's three faces to show (Brent, 2026-11-13). */
export function dashboardFace(s: Pick<State, "settingOn" | "group" | "preparing" | "closedWaiting" | "sendNowMessage" | "savingsTtd">): "new" | "active" | "used" {
  const active = s.settingOn || !!s.group || s.preparing || s.closedWaiting || !!s.sendNowMessage;
  if (active) return "active";
  return Math.round((Number(s.savingsTtd) || 0) * 100) > 0 ? "used" : "new";
}

/**
 * Consolidated Billing: the switch, where the customer's group stands, the
 * "your bill is ready" notice, the FAQ and (on the Dashboard) the savings counter.
 * Every word comes from src/lib/consolidatedBilling.ts (the Tobago delivery line:
 * src/lib/tobago-delivery.ts). Nothing here says where a package is (R13).
 *
 * `dashboard` (since 2026-11-13 the card lives at the top of the Dashboard, not
 * under Account): a customer who never used it gets the pitch and "more than one
 * package" line; one who has used it sees the lifetime saving first. The switch,
 * its confirmation and "Send my packages now" behave exactly as before.
 */
export default function ConsolidatedBillingCard({
  showFaq = false,
  showSendNow = false,
  dashboard = false,
  initialState = null,
}: {
  showFaq?: boolean;
  /** "Send my packages now" beside the switch. */
  showSendNow?: boolean;
  /** The Dashboard's card: pitch / savings counter, FAQ folded away. */
  dashboard?: boolean;
  /** Tests only: render a known state before the fetch. Pages leave it out. */
  initialState?: State | null;
}) {
  const [state, setState] = React.useState<State | null>(initialState);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [note, setNote] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/consolidated-billing")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setState(d))
      .catch(() => {});
    // A "Send my packages now" tap anywhere on the page moves this card too.
    const on = (e: Event) => setState((prev) => ({ savingsTtd: prev?.savingsTtd, ...((e as CustomEvent).detail as State) }));
    window.addEventListener(CB_STATE_EVENT, on);
    return () => window.removeEventListener(CB_STATE_EVENT, on);
  }, []);

  // Account's "Now on your Dashboard" link lands on #consolidated-billing; the card
  // appears only after its fetch, so the browser's own jump has nothing to reach.
  const loaded = state !== null;
  React.useEffect(() => {
    if (!dashboard || !loaded || window.location.hash !== "#consolidated-billing") return;
    document.getElementById("consolidated-billing")?.scrollIntoView({ block: "start" });
  }, [dashboard, loaded]);

  async function toggle() {
    if (!state) return;
    const next = !state.settingOn;
    if (!next && !window.confirm(CB_OFF_CONFIRM)) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/consolidated-billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ on: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save.");
      setState(data);
      // Turning it on pulls in the packages already with us: say so, and tell
      // "Send my packages now" and the Dashboard's package cards to re-read.
      const enrolled = Number(data.enrolled ?? 0);
      if (next && enrolled > 0) setNote(cbEnrolledText(enrolled));
      window.dispatchEvent(new CustomEvent(CB_STATE_EVENT, { detail: data }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;
  const on = state.settingOn;
  const disabled = busy || (!state.eligible && !on);
  const face = dashboard ? dashboardFace(state) : null;
  const saving = Number(state.savingsTtd) || 0;

  const faq = (state.tobago ? [...CB_FAQ, { q: TOBAGO_DELIVERY_FAQ_Q, a: TOBAGO_DELIVERY_LONG }] : CB_FAQ).map((f) => (
    <details key={f.q} className="border-b border-mist/10 py-2 last:border-b-0">
      <summary className="cursor-pointer text-sm font-medium text-mist">{f.q}</summary>
      <p className="mt-1 text-xs text-muted-dark">{f.a}</p>
    </details>
  ));

  return (
    <section
      id={dashboard ? "consolidated-billing" : undefined}
      className={`scroll-mt-20 rounded-lg border bg-ink-2 p-5 ${dashboard ? "border-green/30" : "border-mist/10"}`}
    >
      {face === "used" && <CbSavingsCounter ttd={saving} swiftCode={state.swiftCode} big />}

      <div className={`flex items-start justify-between gap-4 ${face === "used" ? "mt-4" : ""}`}>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-dark">{CB_NAME}</p>
          {face === "new" && <h2 className="sb-disp mt-2 text-xl leading-snug text-mist">{CB_DASH_HEADLINE}</h2>}
          <div className="mt-2 space-y-2 text-sm text-mist">
            {state.sendNowMessage && <p role="status" className="font-semibold">{state.sendNowMessage}</p>}
            {face === "new" || face === "used" ? (
              <>
                <p>{CB_DASH_PITCH}</p>
                <p className="text-xs text-muted-dark">{CB_DASH_MULTI_ONLY}</p>
              </>
            ) : (
              <>
                {!on && !state.sendNowMessage && <p>{CB_LONG_DESCRIPTION}</p>}
                {!on && !state.sendNowMessage && <p>{CB_EXISTING_INCLUDED}</p>}
              </>
            )}
            {on && note && <p className="font-semibold">{note}</p>}
            {showSendNow && state.preparing && !state.sendNowMessage && <p className="font-semibold">{CB_PREPARING_TEXT}</p>}
            {/* R13a: no day count, window date or place, so an open group and no group yet read the same. */}
            {on && state.closedWaiting && <p>{CB_CLOSED_CARD}</p>}
            {on && !state.closedWaiting && <p>{CB_ON_TEXT}</p>}
            {!on && state.closedWaiting && !state.sendNowMessage && <p>{CB_CLOSED_CARD}</p>}
            {/* Tobago customers only (Brent, 25 Oct 2026): the delivery fee and how Consolidated Billing groups it. */}
            {state.tobago && <p className="text-xs text-muted-dark">{TOBAGO_DELIVERY_SHORT}</p>}
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

      {face === "active" && saving > 0 && (
        <div className="mt-3">
          <CbSavingsCounter ttd={saving} swiftCode={state.swiftCode} />
        </div>
      )}

      {showSendNow && state.group && (
        <div className="mt-4 border-t border-mist/10 pt-4">
          <SendNowPanel key={state.group.groupId} group={state.group} onDone={(d) => setState((prev) => ({ savingsTtd: prev?.savingsTtd, ...(d as State) }))} />
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

      {showFaq && !dashboard && (
        <div className="mt-4 border-t border-mist/10 pt-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-dark">Questions</p>
          {faq}
        </div>
      )}
      {showFaq && dashboard && (
        <details className="mt-4 border-t border-mist/10 pt-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-muted-dark">Questions</summary>
          <div className="mt-1">{faq}</div>
        </details>
      )}
    </section>
  );
}
