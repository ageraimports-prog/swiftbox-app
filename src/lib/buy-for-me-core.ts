/**
 * Buy For Me — the pure core (no DB, no server-only → runnable via `npx tsx`).
 * See BUY_FOR_ME_PLAN.md §2-§4.
 *
 * ONE CALCULATOR. Every quote figure a customer ever sees is computed here, at
 * the moment staff send the quote, and frozen onto `swiftbox_bfm_quotes`. The
 * PWA displays the stored figures and never recomputes them, so there is no
 * second implementation to drift.
 *
 * ALL MONEY IS INTEGER CENTS. DECIMAL strings from MySQL are parsed as strings
 * (`decimalToCents`), never through a float, and every rounding is an explicit
 * half-up on integers.
 *
 * THE FEE IS ON ITEM VALUE ONLY. US sales tax and US shipping to Miami are
 * passed through at cost; the service fee is fee% × (unit price × qty) summed.
 * A top-up follows the same rule on its EXTRA item value.
 *
 * THE PREPAID RULE lives in `transitionError`: `purchased` is refused unless
 * every quote on the request is paid (a staff-confirmed slip), and nothing a
 * customer can do reaches `paid`.
 */

/* ───────────────────────────── statuses ───────────────────────────── */

/**
 * `swiftbox_bfm_requests.status` is VARCHAR, not ENUM (live MySQL is not in
 * strict mode; an ENUM stores '' for an unknown value). This list IS the
 * vocabulary — never write a status that is not in it.
 */
export const BFM_STATUSES = [
  "submitted",
  "quoted",
  "payment_uploaded",
  "paid",
  "purchased",
  "arrived_miami",
  "unable_to_purchase",
  "refunded",
  "closed",
  "cancelled",
  "rejected",
] as const;
export type BfmStatus = (typeof BFM_STATUSES)[number];

export function isBfmStatus(s: unknown): s is BfmStatus {
  return typeof s === "string" && (BFM_STATUSES as readonly string[]).includes(s);
}

export const BFM_STATUS_LABEL: Record<BfmStatus, { customer: string; staff: string }> = {
  submitted: { customer: "Submitted", staff: "Needs quote" },
  quoted: { customer: "Quote ready — awaiting payment", staff: "Awaiting payment" },
  payment_uploaded: { customer: "Payment sent — checking", staff: "Check payment" },
  paid: { customer: "Payment confirmed", staff: "To buy" },
  purchased: { customer: "Purchased — on the way to Miami", staff: "On the way to Miami" },
  arrived_miami: { customer: "Arrived in Miami", staff: "Arrived in Miami" },
  unable_to_purchase: { customer: "Unable to purchase", staff: "Unable to purchase" },
  refunded: { customer: "Refunded", staff: "Refunded" },
  closed: { customer: "Complete", staff: "Closed" },
  cancelled: { customer: "Cancelled", staff: "Cancelled" },
  rejected: { customer: "Not possible", staff: "Rejected" },
};

export type BfmActor = "customer" | "staff";

/** Facts about a request that some transitions depend on. */
export type TransitionFacts = {
  /** At least one quote has status `paid` (money has been confirmed). */
  hasPaidQuote: boolean;
  /** A quote is waiting for payment (status `awaiting_payment`). */
  hasUnpaidQuote: boolean;
  /** Number of refunds recorded on the request. */
  refundCount: number;
  /** Number of packages (WR#) linked to the request. */
  linkedPackages: number;
};

export const NO_FACTS: TransitionFacts = {
  hasPaidQuote: false,
  hasUnpaidQuote: false,
  refundCount: 0,
  linkedPackages: 0,
};

/**
 * Why `from → to` by `actor` is refused, or null when it is allowed. The one
 * place the lifecycle is written down; every server write checks it and then
 * applies the change with a conditional `UPDATE … WHERE status = :from`.
 */
export function transitionError(
  from: BfmStatus,
  to: BfmStatus,
  actor: BfmActor,
  facts: TransitionFacts
): string | null {
  const staffOnly = actor === "staff" ? null : "Only Swiftbox staff can do that.";
  const bad = `A request that is "${BFM_STATUS_LABEL[from].staff}" cannot move to "${BFM_STATUS_LABEL[to].staff}".`;

  switch (to) {
    case "quoted":
      // Send the original quote, revise it, reject a slip, or raise a top-up.
      if (staffOnly) return staffOnly;
      if (from === "submitted" || from === "quoted" || from === "payment_uploaded") return null;
      if (from === "paid") return null; // a top-up
      return bad;

    case "payment_uploaded":
      if (actor !== "customer") return "Only the customer uploads a payment slip.";
      if (from !== "quoted") return bad;
      if (!facts.hasUnpaidQuote) return "There is no quote waiting for payment.";
      return null;

    case "paid":
      if (staffOnly) return staffOnly;
      if (from === "payment_uploaded") return null; // slip confirmed
      // Withdrawing an unpaid top-up puts a paid request back where it was.
      if (from === "quoted" && facts.hasPaidQuote) return null;
      return bad;

    case "purchased":
      if (staffOnly) return staffOnly;
      if (from !== "paid") return bad;
      // THE PREPAID RULE. `paid` already means the last slip was confirmed, but a
      // top-up raised and not yet paid must still block the purchase.
      if (!facts.hasPaidQuote || facts.hasUnpaidQuote) {
        return "Every quote, including any top-up, must be paid and confirmed before the item is bought.";
      }
      return null;

    case "arrived_miami":
      if (staffOnly) return staffOnly;
      if (from !== "purchased") return bad;
      if (facts.linkedPackages < 1) return "Link the package (WR#) first.";
      return null;

    case "unable_to_purchase":
      if (staffOnly) return staffOnly;
      return from === "paid" || from === "purchased" ? null : bad;

    case "refunded":
      if (staffOnly) return staffOnly;
      if (from !== "unable_to_purchase" && from !== "cancelled") return bad;
      if (!facts.hasPaidQuote) return "Nothing was paid, so there is nothing to refund.";
      if (facts.refundCount < 1) return "Record the refund first.";
      return null;

    case "closed":
      if (staffOnly) return staffOnly;
      return from === "arrived_miami" || from === "refunded" ? null : bad;

    case "cancelled":
      if (actor === "customer") {
        if (from === "submitted") return null;
        if (from === "quoted" && !facts.hasPaidQuote) return null;
        return "This request can no longer be cancelled here — please message the Swiftbox team.";
      }
      return from === "submitted" || from === "quoted" || from === "payment_uploaded" || from === "paid"
        ? null
        : bad;

    case "rejected":
      if (staffOnly) return staffOnly;
      if (from !== "submitted" && from !== "quoted") return bad;
      if (facts.hasPaidQuote) return "Money has been paid on this request — use Unable to purchase and record a refund.";
      return null;

    case "submitted":
      return "A request cannot go back to Submitted.";
  }
}

/** Statuses a request never leaves (on its own). */
export function isFinalStatus(s: BfmStatus): boolean {
  return s === "closed" || s === "rejected";
}

/* ───────────────────────── queue tabs (admin) ───────────────────────── */

export const BFM_QUEUE_TABS = [
  { id: "needs_quote", label: "Needs quote", statuses: ["submitted"] },
  { id: "awaiting_payment", label: "Awaiting payment", statuses: ["quoted"] },
  { id: "check_payment", label: "Check payment", statuses: ["payment_uploaded"] },
  { id: "to_buy", label: "To buy", statuses: ["paid"] },
  { id: "on_the_way", label: "On the way to Miami", statuses: ["purchased"] },
  { id: "arrived", label: "Arrived", statuses: ["arrived_miami"] },
  { id: "refunds", label: "Unable / refunds", statuses: ["unable_to_purchase", "refunded"] },
  { id: "closed", label: "Closed", statuses: ["closed"] },
  { id: "cancelled", label: "Cancelled / rejected", statuses: ["cancelled", "rejected"] },
] as const satisfies ReadonlyArray<{ id: string; label: string; statuses: readonly BfmStatus[] }>;
export type BfmQueueTab = (typeof BFM_QUEUE_TABS)[number]["id"];

export function isBfmQueueTab(s: unknown): s is BfmQueueTab {
  return BFM_QUEUE_TABS.some((t) => t.id === s);
}

/* ───────────────────────────── money ───────────────────────────── */

/** Cents from a MySQL DECIMAL string ("12.30", "-4.00", "7"). Parsed as text, never via float. */
export function decimalToCents(raw: unknown): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const s = String(raw).trim();
  const m = /^(-?)(\d+)(?:\.(\d{0,4}))?$/.exec(s);
  if (!m) {
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error(`Not a money value: "${s}"`);
    return Math.round(n * 100);
  }
  const [, sign, whole, frac = ""] = m;
  const f = (frac + "0000").slice(0, 4); // 4 places, then round half-up to 2
  const tenThousandths = Number(whole) * 10000 + Number(f);
  const cents = Math.floor((tenThousandths + 50) / 100);
  return sign === "-" ? -cents : cents;
}

/** Nullable variant: NULL / "" stays null. */
export function decimalToCentsOrNull(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  return decimalToCents(raw);
}

/** "12.30" for a DECIMAL(12,2) write. */
export function centsToDecimal(cents: number): string {
  if (!Number.isInteger(cents)) throw new Error(`Cents must be an integer (got ${cents})`);
  const neg = cents < 0;
  const a = Math.abs(cents);
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/**
 * Parse a money amount a person typed ("12", "12.5", "$1,234.56"). Refuses
 * negatives, more than 2 decimals and garbage — it never answers garbage with 0
 * (that is how parseMoney once zeroed a package's whole tax bill).
 */
export function parseMoneyInput(
  raw: unknown,
  opts: { allowZero?: boolean; max?: number } = {}
): { ok: true; cents: number } | { ok: false; error: string } {
  const s = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (s === "") return { ok: false, error: "Enter an amount." };
  const cleaned = s.replace(/^(US|TT)?\$/i, "").replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    return { ok: false, error: `"${s}" is not an amount (use numbers like 12.50).` };
  }
  const cents = decimalToCents(cleaned);
  if (cents === 0 && !opts.allowZero) return { ok: false, error: "The amount must be more than 0." };
  const max = opts.max ?? 100_000_00;
  if (cents > max) return { ok: false, error: `That is more than ${formatMoney(max)} — check the figure.` };
  return { ok: true, cents };
}

/** "1,234.56" */
export function formatMoney(cents: number): string {
  const neg = cents < 0;
  const a = Math.abs(cents);
  const whole = Math.floor(a / 100).toLocaleString("en-US");
  return `${neg ? "-" : ""}${whole}.${String(a % 100).padStart(2, "0")}`;
}

export const ttdText = (cents: number) => `TT$${formatMoney(cents)}`;
export const usdText = (cents: number) => `US$${formatMoney(cents)}`;

/** The Swiftbox convention: TTD first, USD in brackets. */
export function ttdWithUsd(ttdCents: number, usdCents: number): string {
  return `${ttdText(ttdCents)} (${usdText(usdCents)})`;
}

/** round_half_up(a × b / scale) for non-negative integers. */
function mulDivHalfUp(a: number, b: number, scale: number): number {
  if (a < 0 || b < 0) throw new Error("mulDivHalfUp is for non-negative values");
  const p = a * b;
  if (!Number.isSafeInteger(p)) throw new Error("Amount too large to calculate exactly");
  return Math.floor((p + scale / 2) / scale);
}

/** fee% as basis points (15 → 1500, 12.5 → 1250). Two decimal places at most. */
export function feePctToBasisPoints(feePct: number): number {
  if (!Number.isFinite(feePct) || feePct < 0 || feePct > 100) throw new Error(`Bad fee % ${feePct}`);
  return Math.round(feePct * 100);
}

/** rate × 10000 (6.8 → 68000). Four decimal places at most, like the setting column. */
export function roeToTenThousandths(roe: number): number {
  if (!Number.isFinite(roe) || roe <= 0) throw new Error(`Bad exchange rate ${roe}`);
  return Math.round(roe * 10000);
}

export function serviceFeeCents(itemValueCents: number, feePct: number): number {
  return mulDivHalfUp(itemValueCents, feePctToBasisPoints(feePct), 10000);
}

export function usdToTtdCents(usdCents: number, roe: number): number {
  return mulDivHalfUp(usdCents, roeToTenThousandths(roe), 10000);
}

export type QuoteComponents = {
  itemValue: number;
  usTax: number;
  usShipping: number;
  fee: number;
  total: number;
};

export type QuoteFigures = {
  feePct: number;
  roe: number;
  usd: QuoteComponents;
  ttd: QuoteComponents;
};

export type PricedItem = {
  qty: number;
  unitPriceCents: number;
  usTaxCents: number;
  usShippingCents: number;
};

/**
 * From the three USD totals to the full frozen quote. Used for the original quote
 * (after summing the items) and for a top-up (the extras entered directly).
 */
export function quoteFromComponents(
  c: { itemValueCents: number; usTaxCents: number; usShippingCents: number },
  feePct: number,
  roe: number
): QuoteFigures {
  for (const [k, v] of Object.entries(c)) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`${k} must be a whole, non-negative number of cents`);
  }
  const fee = serviceFeeCents(c.itemValueCents, feePct);
  const usd: QuoteComponents = {
    itemValue: c.itemValueCents,
    usTax: c.usTaxCents,
    usShipping: c.usShippingCents,
    fee,
    total: c.itemValueCents + c.usTaxCents + c.usShippingCents + fee,
  };
  // Each component converted on its own; the TTD total is their SUM, so the TTD
  // column adds up on a calculator (it may differ from total_usd × roe by a cent).
  const itemValue = usdToTtdCents(usd.itemValue, roe);
  const usTax = usdToTtdCents(usd.usTax, roe);
  const usShipping = usdToTtdCents(usd.usShipping, roe);
  const feeTtd = usdToTtdCents(usd.fee, roe);
  const ttd: QuoteComponents = {
    itemValue,
    usTax,
    usShipping,
    fee: feeTtd,
    total: itemValue + usTax + usShipping + feeTtd,
  };
  return { feePct, roe, usd, ttd };
}

/** item value = Σ unit price × qty; tax and shipping summed at cost. */
export function computeOriginalQuote(items: readonly PricedItem[], feePct: number, roe: number): QuoteFigures {
  let itemValueCents = 0;
  let usTaxCents = 0;
  let usShippingCents = 0;
  for (const it of items) {
    if (!Number.isInteger(it.qty) || it.qty < 0) throw new Error("Quantity must be a whole number");
    itemValueCents += it.unitPriceCents * it.qty;
    usTaxCents += it.usTaxCents;
    usShippingCents += it.usShippingCents;
  }
  return quoteFromComponents({ itemValueCents, usTaxCents, usShippingCents }, feePct, roe);
}

/** Why an original quote cannot be sent from these items, or null. */
export function originalQuoteError(
  items: ReadonlyArray<{ qty: number; unitPriceCents: number | null; usTaxCents: number | null; usShippingCents: number | null }>
): string | null {
  if (items.length === 0) return "This request has no items.";
  const included = items.filter((i) => i.qty > 0);
  if (included.length === 0) return "At least one item needs a quantity of 1 or more.";
  for (const [n, it] of items.entries()) {
    if (it.qty === 0) continue; // left out of the quote on purpose
    if (it.unitPriceCents == null || it.unitPriceCents <= 0) return `Item ${n + 1} needs its price.`;
    if (it.usTaxCents == null) return `Item ${n + 1} needs its US tax (enter 0 if none).`;
    if (it.usShippingCents == null) return `Item ${n + 1} needs its US shipping (enter 0 if none).`;
  }
  return null;
}

/** A top-up adds money; it never takes any away (that is a refund). */
export function topUpError(c: { itemValueCents: number; usTaxCents: number; usShippingCents: number }): string | null {
  const vals = [c.itemValueCents, c.usTaxCents, c.usShippingCents];
  if (vals.some((v) => !Number.isInteger(v) || v < 0)) {
    return "A top-up can only add money. To give money back, record a refund.";
  }
  if (vals.every((v) => v === 0)) return "Enter the extra amount.";
  return null;
}

/* ───────────────────────── refunds ───────────────────────── */

/**
 * A refund is money RETURNED by bank transfer — a record of money going back.
 * There is NO Buy For Me credit (Brent, 2026-09-27): what the customer paid is
 * what is spent; nothing is ever held as credit or applied to another invoice.
 */
export const REFUND_METHODS = ["bank_transfer"] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

export const REFUND_METHOD_LABEL: Record<RefundMethod, string> = {
  bank_transfer: "Bank transfer back to the customer",
};

export function isRefundMethod(s: unknown): s is RefundMethod {
  return typeof s === "string" && (REFUND_METHODS as readonly string[]).includes(s);
}

/**
 * Why this refund cannot be recorded, or null. `refundable` is what was actually
 * received (confirmed paid_ttd) minus what has already been refunded; a refund
 * can never exceed it (the server re-checks this inside the INSERT itself).
 */
export function refundError(r: { amountCents: number; method: unknown; refundDate: string; refundableCents: number }): string | null {
  if (!Number.isInteger(r.amountCents) || r.amountCents <= 0) return "Enter the refund amount.";
  if (!isRefundMethod(r.method)) return "Refunds go back by bank transfer only.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.refundDate) || Number.isNaN(Date.parse(`${r.refundDate}T12:00:00Z`))) {
    return "Enter the refund date.";
  }
  if (r.refundableCents <= 0) return "Nothing is left to refund on this request.";
  if (r.amountCents > r.refundableCents) {
    return `That is more than can be refunded — at most ${ttdText(r.refundableCents)} (received minus already refunded).`;
  }
  return null;
}

/* ───────────────────────── WR# ───────────────────────── */

/** "wr1202", " WR 1202 ", "1202" → "WR1202"; anything else → null. */
export function normalizeWr(raw: unknown): string | null {
  const s = String(raw ?? "").toUpperCase().replace(/\s+/g, "");
  const m = /^(?:WR)?(\d{1,8})$/.exec(s);
  return m ? `WR${m[1]}` : null;
}

/** Paid (confirmed amounts received) minus refunded — what can still be refunded. */
export function refundableCents(paidCents: readonly number[], refundedCents: readonly number[]): number {
  const paid = paidCents.reduce((a, b) => a + b, 0);
  const refunded = refundedCents.reduce((a, b) => a + b, 0);
  return Math.max(0, paid - refunded);
}

/* ───────────────────────── references ───────────────────────── */

/** "BFM-00012" — the request number, and the original quote's payment reference. */
export function requestNo(id: number): string {
  return `BFM-${String(id).padStart(5, "0")}`;
}

/** Payment reference for a quote: "BFM-00012" (seq 0) or "BFM-00012-T1" (top-up 1). */
export function paymentRef(requestId: number, seq: number): string {
  return seq === 0 ? requestNo(requestId) : `${requestNo(requestId)}-T${seq}`;
}

/** "SWIFT-0364" from users.ac (which is dirty: 2-digit values, stray tabs). */
export function swiftCode(ac: string | null | undefined): string {
  const digits = String(ac ?? "").trim().replace(/^SWIFT-/i, "").replace(/\s+/g, "");
  return /^\d+$/.test(digits) ? `SWIFT-${digits.padStart(4, "0")}` : digits || "—";
}

/* ───────────────────────── customer-visible history ───────────────────────── */

/**
 * `swiftbox_bfm_events.kind` vocabulary. `notify` = this moment gets an email and
 * an in-app update for the customer. Customer-driven moments are recorded for
 * the timeline but not notified back to the person who just did them.
 */
export const BFM_EVENT_DEFS = {
  submitted: { title: "Request submitted", notify: false },
  quote_sent: { title: "Your quote is ready", notify: true },
  quote_revised: { title: "Your quote was updated", notify: true },
  topup_sent: { title: "A top-up payment is needed", notify: true },
  topup_withdrawn: { title: "Top-up withdrawn — nothing more to pay", notify: true },
  slip_uploaded: { title: "Payment slip uploaded", notify: false },
  payment_confirmed: { title: "Payment confirmed", notify: true },
  payment_rejected: { title: "Payment slip not accepted", notify: true },
  purchased: { title: "Purchased", notify: true },
  arrived_miami: { title: "Arrived at our Miami warehouse", notify: true },
  unable_to_purchase: { title: "We were unable to purchase this", notify: true },
  refund_recorded: { title: "Refund recorded", notify: true },
  refunded: { title: "Refunded", notify: false },
  closed: { title: "Complete", notify: false },
  cancelled_by_customer: { title: "You cancelled this request", notify: false },
  cancelled_by_staff: { title: "Request cancelled", notify: true },
  rejected: { title: "Request not possible", notify: true },
} as const;
export type BfmEventKind = keyof typeof BFM_EVENT_DEFS;

export function isBfmEventKind(s: unknown): s is BfmEventKind {
  return typeof s === "string" && Object.prototype.hasOwnProperty.call(BFM_EVENT_DEFS, s);
}

/* ───────────────────────── text going into the utf8 tables ───────────────────────── */

/**
 * Make any customer or staff text safe for a 3-byte `utf8` column BEFORE it is
 * written. The swiftbox_bfm_* tables are utf8 (not utf8mb4) and the bridge
 * connects as utf8, so an emoji or any other character outside the Basic
 * Multilingual Plane (4 bytes in UTF-8) can fail the insert or be silently
 * mangled. Such characters are REMOVED; so are lone surrogate halves and
 * control characters other than newline and tab. Then trimmed and cut to
 * `max` characters (the column width — every BMP character is one UTF-16
 * unit, so .length is the character count once the 4-byte ones are gone).
 *
 * The PWA writes the same tables and keeps an identical copy of this function
 * with the same tests (Block D).
 */
export function cleanText(raw: unknown, max: number): string {
  if (raw === null || raw === undefined) return "";
  let s = String(raw);
  s = s.replace(/[\u{10000}-\u{10FFFF}]/gu, ""); // 4-byte characters (emoji etc.)
  s = s.replace(/[\uD800-\uDFFF]/g, ""); // any lone surrogate left behind
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ""); // control chars (keep \n \t \r)
  s = s.replace(/\uFE0F|\u200D/g, ""); // emoji variation selector / joiner left without their emoji
  s = s.trim();
  return s.length > max ? s.slice(0, max).trimEnd() : s;
}

/** True when every character fits a 3-byte utf8 column. */
export function fitsUtf8mb3(s: string): boolean {
  return !/[\uD800-\uDFFF]/.test(s);
}

/* ───────────────────────── customer input limits ───────────────────────── */

export const MAX_ITEMS_PER_REQUEST = 20;

/**
 * The product link as something safe to put in an href, or null. Customers type
 * these, and staff click them in the admin — a "javascript:" or "data:" link
 * must never become clickable. Only absolute http(s) URLs pass.
 */
export function safeProductUrl(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (s.length === 0 || s.length > 2000) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (!u.hostname.includes(".")) return null;
  return u.toString();
}
export const MAX_QTY = 99;
