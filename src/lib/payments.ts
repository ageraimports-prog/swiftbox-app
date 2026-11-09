import "server-only";

/**
 * Card payments (Stripe) — through the ADMIN, which owns every Stripe key and
 * every rule (SwiftboxAdmin STRIPE_PAYMENTS_PLAN.md). This app never holds a
 * Stripe secret and never writes an invoice or a payment: it asks the admin
 * whether an invoice can be paid, for a PaymentIntent, and whether it went
 * through. Same key-gated pattern as src/lib/consolidated-billing.ts
 * (`x-consolidation-key` = CONSOLIDATION_HOOK_KEY, ADMIN_URL).
 */

export type PayOffer = {
  available: boolean;
  reason: string | null;
  code: string | null;
  /** The TT$ balance owed, what the card is charged in US$ at the owner's rate, the rate, and the one line + note the checkout shows. */
  amountTtd: number | null;
  amountUsd: number | null;
  usdRate: number | null;
  fxLine: string | null;
  fxNote: string;
  currency: string;
  termsVersion: string;
  termsUrl: string;
  refundPolicyUrl: string;
  paidByCard: { amountTtd: number; amountUsd: number; usdRate: number; at: string; last4: string | null; brand: string | null } | null;
  processing: boolean;
  /** The newest attempt's failure in the customer's words (a declined US$ charge). */
  lastFailure: string | null;
  mode: "test" | "live" | "none";
  /** PayPal's own verdict (absent from an admin without PayPal — then no PayPal button). */
  paypal?: PayPalOffer;
};

/**
 * PayPal (admin PAYPAL_PAYMENTS_PLAN.md) — the same verdict for PayPal, which has
 * its own switch. Arrives as `offer.paypal` from the same admin call.
 */
export type PayPalOffer = {
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
  paid: { amountTtd: number; amountUsd: number; usdRate: number; at: string; payerEmail: string | null } | null;
  pending: boolean;
  lastFailure: string | null;
  mode: "sandbox" | "live" | "none";
};

export type PayPalOrderAnswer =
  | { ok: true; approveUrl: string; rowId: number; orderId: string; amountTtd: number; amountUsd: number; usdRate: number; fxLine: string }
  | { ok: false; error: string; code: string };

export type PayPalReturnAnswer = {
  outcome: string;
  message: string;
  invoiceNo?: string;
  amountTtd?: number;
  amountUsd?: number;
  fxLine?: string;
};

export type IntentAnswer =
  | { ok: true; clientSecret: string; publishableKey: string; paymentIntentId: string; amountTtd: number; amountUsd: number; usdRate: number; fxLine: string; fxNote: string; currency: string; reused: boolean }
  | { ok: false; error: string; code: string };

export type PayStatus = { status: string; paid: boolean; error: string | null };

function admin(): { base: string; key: string } | null {
  const key = process.env.CONSOLIDATION_HOOK_KEY ?? "";
  if (!key) return null;
  const base = (process.env.ADMIN_URL || "https://admin.swiftboxtt.com").replace(/\/+$/, "");
  return { base, key };
}

const UNAVAILABLE: PayOffer = {
  available: false,
  reason: "Card payments are not available right now.",
  code: "not_configured",
  amountTtd: null,
  amountUsd: null,
  usdRate: null,
  fxLine: null,
  fxNote: "",
  currency: "USD",
  termsVersion: "",
  termsUrl: "https://swiftboxtt.com/terms",
  refundPolicyUrl: "https://swiftboxtt.com/refund-policy",
  paidByCard: null,
  processing: false,
  lastFailure: null,
  mode: "none",
};

/** Never throws — an unreachable admin means "no Pay now button", nothing worse. */
export async function fetchPayOffer(userId: number, invoiceNo: string): Promise<PayOffer> {
  const a = admin();
  if (!a) return UNAVAILABLE;
  try {
    const res = await fetch(`${a.base}/api/payments/offer?invoiceNo=${encodeURIComponent(invoiceNo)}&userId=${userId}`, {
      headers: { "x-consolidation-key": a.key },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return UNAVAILABLE;
    return (await res.json()) as PayOffer;
  } catch {
    return UNAVAILABLE;
  }
}

export async function requestPaymentIntent(input: {
  userId: number;
  invoiceNo: string;
  terms: { version: string; accepted: boolean };
  ip: string | null;
  userAgent: string | null;
}): Promise<IntentAnswer> {
  const a = admin();
  if (!a) return { ok: false, error: "Card payments are not available right now.", code: "not_configured" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25_000);
  try {
    const res = await fetch(`${a.base}/api/payments/intent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-consolidation-key": a.key },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: ctl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Partial<IntentAnswer> & { error?: string; code?: string };
    if (!res.ok || !("ok" in data) || !data.ok) {
      return { ok: false, error: data.error || "Couldn't start the card payment. Please try again.", code: data.code || "error" };
    }
    return data as IntentAnswer;
  } catch {
    return { ok: false, error: "Couldn't start the card payment. Please try again.", code: "network" };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPayStatus(userId: number, paymentIntentId: string): Promise<PayStatus | null> {
  const a = admin();
  if (!a) return null;
  try {
    const res = await fetch(`${a.base}/api/payments/status?paymentIntentId=${encodeURIComponent(paymentIntentId)}&userId=${userId}`, {
      headers: { "x-consolidation-key": a.key },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as PayStatus;
  } catch {
    return null;
  }
}

/** Ask the admin for a PayPal order (it checks everything and answers PayPal's approval link). */
export async function requestPayPalOrder(input: {
  userId: number;
  invoiceNo: string;
  terms: { version: string; accepted: boolean };
  ip: string | null;
  userAgent: string | null;
}): Promise<PayPalOrderAnswer> {
  const a = admin();
  if (!a) return { ok: false, error: "PayPal payments are not available right now.", code: "not_configured" };
  try {
    const res = await fetch(`${a.base}/api/payments/paypal/order`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-consolidation-key": a.key },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const data = (await res.json().catch(() => ({}))) as Partial<PayPalOrderAnswer> & { error?: string; code?: string };
    if (!res.ok || !("ok" in data) || !data.ok) return { ok: false, error: data.error || "Couldn't start the PayPal payment. Please try again.", code: data.code || "error" };
    return data as PayPalOrderAnswer;
  } catch {
    return { ok: false, error: "Couldn't start the PayPal payment. Please try again.", code: "network" };
  }
}

/**
 * The PayPal return / cancel page: the signed link (row + sig) is the proof, so
 * no session is needed — it works in an installed PWA or a TWA custom tab.
 */
export async function sendPayPalReturn(input: { rowId: number; sig: string; token: string | null; cancel: boolean }): Promise<PayPalReturnAnswer> {
  const a = admin();
  if (!a) return { outcome: "error", message: "We couldn't confirm the PayPal payment yet. Please don't pay again — check the invoice in a few minutes." };
  try {
    const res = await fetch(`${a.base}/api/payments/paypal/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-consolidation-key": a.key },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(55_000),
    });
    const data = (await res.json().catch(() => null)) as PayPalReturnAnswer | null;
    if (data && typeof data.outcome === "string") return data;
    return { outcome: "error", message: "We couldn't confirm the PayPal payment yet. Please don't pay again — check the invoice in a few minutes." };
  } catch {
    return { outcome: "error", message: "We couldn't confirm the PayPal payment yet. Please don't pay again — check the invoice in a few minutes." };
  }
}
