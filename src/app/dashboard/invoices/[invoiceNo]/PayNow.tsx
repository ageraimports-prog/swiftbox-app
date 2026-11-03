"use client";

import * as React from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { formatTtd } from "@/lib/invoice-line";

/**
 * "Pay now" on an issued invoice (SwiftboxAdmin STRIPE_PAYMENTS_PLAN.md).
 * Revision b: the card is charged in US DOLLARS. The admin works out the US$
 * figure from the TT$ balance at Brent's rate (rounded up) and locks it on the
 * payment; this screen shows both ("TT$680.00 = US$100.00 at 6.80") and the
 * foreign-transaction-fee note, and never computes a figure itself.
 *
 *   1. ask /api/invoices/<no>/pay?offer=1 — can it be paid, TT$ / US$ / rate;
 *   2. the customer ticks "I agree to the Terms and Refund Policy";
 *   3. POST …/pay → a PaymentIntent (client secret + publishable key — no Stripe
 *      key lives in this app);
 *   4. Stripe's Payment Element (card, Apple Pay, Google Pay; 3-D Secure asked
 *      for on every payment) confirms it; a bank challenge may bounce through
 *      `return_url` (?payment=return&payment_intent=…);
 *   5. …/pay?paymentIntentId= — the admin reads Stripe and records the payment
 *      once, so "Paid" shows even before the webhook lands; `onPaid` reloads
 *      the invoice. A decline shows the fixed US$ wording from the admin.
 */

type Offer = {
  available: boolean;
  reason: string | null;
  code: string | null;
  amountTtd: number | null;
  amountUsd: number | null;
  usdRate: number | null;
  fxLine: string | null;
  fxNote: string;
  termsVersion: string;
  termsUrl: string;
  refundPolicyUrl: string;
  paidByCard: { amountTtd: number; amountUsd: number; usdRate: number; at: string; last4: string | null; brand: string | null } | null;
  processing: boolean;
  lastFailure: string | null;
  mode: "test" | "live" | "none";
};

type Intent = { clientSecret: string; publishableKey: string; paymentIntentId: string; amountTtd: number; amountUsd: number; fxLine: string; fxNote: string };

const DECLINED = "Your bank declined a US$ charge — contact your bank or pay another way.";
const usd = (n: number) => `US$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const stripeCache = new Map<string, Promise<Stripe | null>>();
function stripeFor(pk: string): Promise<Stripe | null> {
  let p = stripeCache.get(pk);
  if (!p) {
    p = loadStripe(pk);
    stripeCache.set(pk, p);
  }
  return p;
}

export default function PayNow({ invoiceNo, balance, onPaid, autoOpen = false }: { invoiceNo: string; balance: number; onPaid: () => void; autoOpen?: boolean }) {
  const [offer, setOffer] = React.useState<Offer | null>(null);
  const [agreed, setAgreed] = React.useState(false);
  const [intent, setIntent] = React.useState<Intent | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<"paid" | "processing" | null>(null);
  const [open, setOpen] = React.useState(autoOpen);

  // 1. The offer. Also the return leg of a 3-D Secure redirect.
  React.useEffect(() => {
    let cancelled = false;
    const url = new URL(window.location.href);
    const returning = url.searchParams.get("payment") === "return";
    const pi = url.searchParams.get("payment_intent");
    if (returning && pi) {
      url.searchParams.delete("payment");
      url.searchParams.delete("payment_intent");
      url.searchParams.delete("payment_intent_client_secret");
      url.searchParams.delete("redirect_status");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      setOpen(true);
      setBusy(true);
      checkStatus(pi).finally(() => {
        if (!cancelled) setBusy(false);
      });
    }
    fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}/pay?offer=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((o: Offer | null) => {
        if (!cancelled && o) {
          setOffer(o);
          if (o.lastFailure && !o.paidByCard) setError(o.lastFailure);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceNo]);

  async function checkStatus(pi: string): Promise<boolean> {
    // The admin reads Stripe itself; a processing payment is re-asked a few times.
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}/pay?paymentIntentId=${encodeURIComponent(pi)}`).catch(() => null);
      const st = res && res.ok ? ((await res.json()) as { status: string; paid: boolean; error: string | null }) : null;
      if (st?.paid) {
        setDone("paid");
        setIntent(null);
        onPaid();
        return true;
      }
      if (st?.status === "processing") {
        setDone("processing");
        setIntent(null);
        return true;
      }
      if (st && (st.status === "failed" || st.status === "canceled" || (st.status === "created" && st.error))) {
        setError(st.error || DECLINED);
        setIntent(null);
        return false;
      }
      if (st && st.status === "succeeded" && !st.paid) {
        // Taken by Stripe, not yet on the invoice — the webhook will finish it; say so.
        setDone("processing");
        setIntent(null);
        return true;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    setError("We're still confirming your payment. Please check back in a minute — don't pay twice.");
    return false;
  }

  async function start() {
    if (!offer?.available || !agreed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invoices/${encodeURIComponent(invoiceNo)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ terms: { version: offer.termsVersion, accepted: true } }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Intent> & { ok?: boolean; error?: string };
      if (!res.ok || !data.ok || !data.clientSecret || !data.publishableKey) {
        setError(data.error || "Couldn't start the card payment. Please try again.");
        return;
      }
      setIntent({
        clientSecret: data.clientSecret,
        publishableKey: data.publishableKey,
        paymentIntentId: data.paymentIntentId!,
        amountTtd: data.amountTtd ?? offer.amountTtd ?? balance,
        amountUsd: data.amountUsd ?? offer.amountUsd ?? 0,
        fxLine: data.fxLine ?? offer.fxLine ?? "",
        fxNote: data.fxNote ?? offer.fxNote,
      });
    } catch {
      setError("Couldn't start the card payment. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (balance <= 0 && !done) return null;
  if (!offer) return null;

  if (done === "paid") {
    return (
      <section className="rounded-lg border border-green/30 bg-green/10 p-5 text-sm text-mist">
        <p className="font-bold text-green">Payment received — thank you.</p>
        <p className="mt-1 text-muted">Nothing to pay the driver on delivery for this invoice. A receipt is on its way to your email.</p>
      </section>
    );
  }
  if (done === "processing" || offer.processing) {
    return (
      <section className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-5 text-sm text-mist">
        <p className="font-bold text-amber-300">Your card payment is being confirmed.</p>
        <p className="mt-1 text-muted">This can take a few minutes. Please don&rsquo;t pay again — we&rsquo;ll email you a receipt once it clears.</p>
      </section>
    );
  }
  if (offer.paidByCard) return null;
  if (!offer.available) {
    // Quiet unless the reason is one the customer can act on. No rate set → nothing at all (rule b7).
    if (offer.code === "cb_held") return <p className="text-xs text-muted-dark">{offer.reason}</p>;
    return null;
  }

  const usdAmount = intent?.amountUsd ?? offer.amountUsd ?? 0;
  const line = intent?.fxLine ?? offer.fxLine ?? "";
  const note = intent?.fxNote ?? offer.fxNote;

  return (
    <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-dark">Pay online</p>
          <p className="mt-1 text-sm text-muted">Card, Apple Pay or Google Pay. Or pay the driver in cash or LINX on delivery.</p>
          {/* Rule b2: both figures and the rate, then the foreign-transaction-fee note. */}
          <p className="mt-2 text-base font-bold text-mist">{line}</p>
          <p className="mt-1 text-xs text-muted-dark">{note}</p>
          {offer.mode === "test" && <p className="mt-1 text-[11px] font-bold uppercase text-amber-300">Test mode — no real money moves</p>}
        </div>
      </div>

      {!open && (
        <>
          {error && (
            <div role="alert" className="mt-3 rounded-md bg-red-400/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}
          <button type="button" onClick={() => setOpen(true)} className="mt-4 w-full rounded-lg bg-green px-4 py-3 text-sm font-bold text-ink transition-colors hover:bg-green-deep">
            Pay now — {usd(usdAmount)}
          </button>
        </>
      )}

      {open && !intent && (
        <div className="mt-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-mist">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-5 w-5 accent-green" />
            <span>
              I agree to the{" "}
              <a href={offer.termsUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-green underline">
                Terms
              </a>{" "}
              and{" "}
              <a href={offer.refundPolicyUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-green underline">
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
            onClick={start}
            className="mt-4 w-full rounded-lg bg-green px-4 py-3 text-sm font-bold text-ink transition-colors hover:bg-green-deep disabled:opacity-60"
          >
            {busy ? "One moment…" : `Continue to payment — ${usd(usdAmount)}`}
          </button>
        </div>
      )}

      {intent && (
        <Elements
          stripe={stripeFor(intent.publishableKey)}
          options={{
            clientSecret: intent.clientSecret,
            appearance: {
              theme: "night",
              variables: { colorPrimary: "#00ff40", colorBackground: "#0e1114", colorText: "#e5e7eb", borderRadius: "8px", fontFamily: "system-ui, sans-serif" },
            },
          }}
        >
          <CheckoutForm
            invoiceNo={invoiceNo}
            amountUsd={intent.amountUsd}
            amountTtd={intent.amountTtd}
            paymentIntentId={intent.paymentIntentId}
            onConfirmed={checkStatus}
            onCancel={() => setIntent(null)}
            error={error}
            setError={setError}
          />
        </Elements>
      )}
    </section>
  );
}

function CheckoutForm({
  invoiceNo,
  amountUsd,
  amountTtd,
  paymentIntentId,
  onConfirmed,
  onCancel,
  error,
  setError,
}: {
  invoiceNo: string;
  amountUsd: number;
  amountTtd: number;
  paymentIntentId: string;
  onConfirmed: (pi: string) => Promise<boolean>;
  onCancel: () => void;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const returnUrl = `${window.location.origin}/dashboard/invoices/${encodeURIComponent(invoiceNo)}?payment=return`;
    const { error: err, paymentIntent } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: returnUrl },
      redirect: "if_required",
    });
    if (err) {
      // A card/bank refusal gets Brent's fixed wording (rule b6); a form slip keeps Stripe's own hint.
      setError(err.type === "card_error" ? DECLINED : err.message || "The payment did not go through. Please try again.");
      setBusy(false);
      return;
    }
    await onConfirmed(paymentIntent?.id ?? paymentIntentId);
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="mt-4">
      <PaymentElement onReady={() => setReady(true)} options={{ layout: "tabs" }} />
      {error && (
        <div role="alert" className="mt-3 rounded-md bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      <button type="submit" disabled={!stripe || !elements || !ready || busy} className="mt-4 w-full rounded-lg bg-green px-4 py-3 text-sm font-bold text-ink transition-colors hover:bg-green-deep disabled:opacity-60">
        {busy ? "Confirming…" : `Pay ${usd(amountUsd)} (${formatTtd(amountTtd)})`}
      </button>
      <button type="button" onClick={onCancel} disabled={busy} className="mt-2 w-full rounded-lg border border-mist/20 bg-ink px-4 py-3 text-sm font-semibold text-muted transition-colors hover:border-mist/40">
        Cancel
      </button>
      <p className="mt-3 text-center text-[11px] text-muted-dark">Charged in US dollars. Secured by Stripe; your card details never reach Swiftbox.</p>
    </form>
  );
}
