/**
 * How an invoice's money is READ — one definition for the admin and the
 * customer app. This file is CODE-IDENTICAL in both repos:
 *   SwiftboxAdmin  lib/invoice-money-core.ts
 *   SwiftboxApp    src/lib/invoice-money-core.ts
 * Change both together. PURE: no imports, no DB.
 *
 * The stored header total_ttd is NET of everything that lowers what is owed
 * (referral credits, billing adjustments, the owner's discount). From the lines
 * this works out what each of those was, so every screen shows the same split:
 *
 *   - the OWNER'S DISCOUNT (2026-10-16): a negative line, line_type 'other',
 *     marked basis 'invoice discount'. Shown as "Discount (reason)" under the
 *     totals, never in the charge list and never as a referral credit. It is not
 *     a payment.
 *   - REFERRAL / WELCOME CREDIT: every other negative line EXCEPT 'adjustment'
 *     lines (shipping waived / free pounds), which are already inside the net
 *     shipping figure, and the owner's own added lines (below).
 *   - OWNER-ADDED LINES (2026-10-18): line_type 'other' marked basis
 *     'added by owner' — an extra charge or a credit typed on a draft. A credit
 *     is listed under its OWN description (`ownerCredits`), never as "Referral
 *     credit". A charge is inside the customs subtotal like any TTD line.
 *   - CARRIED CREDIT (2026-10-19): line_type 'other' marked basis
 *     'carried credit' — "Credit from INV-…", what the customer had paid on an
 *     invoice voided because a package did not arrive. Listed like an owner
 *     credit, under its own description, never as "Referral credit".
 *   - STATUS is derived from total and paid, like the stored enum, but nothing
 *     owed (a total of 0 or less) is Paid even with no payment — an invoice
 *     discounted to 0 must never read as owing.
 *   - HOUSE snapshots retain every charge and return status house and zero debt;
 *     no payment or discount is invented to balance the invoice.
 */

export const DISCOUNT_LINE_TYPE = "other";
export const DISCOUNT_BASIS = "invoice discount";
/** The marker of a line the owner added on a draft (charge or credit). */
export const OWNER_LINE_BASIS = "added by owner";
/** The marker of a credit carried from a voided invoice (missed flight). */
export const CARRIED_CREDIT_LINE_BASIS = "carried credit";

export type MoneyLine = { lineType: string; description: string; amountTtd: number; basis: string | null };

export function isDiscountLine(l: { lineType: string; basis: string | null }): boolean {
  return l.lineType === DISCOUNT_LINE_TYPE && (l.basis ?? "").trim() === DISCOUNT_BASIS;
}

export function isOwnerLine(l: { lineType: string; basis: string | null }): boolean {
  return l.lineType === "other" && (l.basis ?? "").trim() === OWNER_LINE_BASIS;
}

export function isCarriedCreditLine(l: { lineType: string; basis: string | null }): boolean {
  return l.lineType === "other" && (l.basis ?? "").trim() === CARRIED_CREDIT_LINE_BASIS;
}

/**
 * The footer row for a discount, from the reason read back out of its line:
 * "Discount" once for the default label (never "Discount (Discount)"), else
 * "Discount (label)". The owner's internal reason is never on the line.
 */
export function discountRowLabel(reason: string): string {
  const t = String(reason ?? "").trim();
  return !t || t === "Discount" ? "Discount" : `Discount (${t})`;
}

/** The reason back out of "Discount (reason)". */
export function discountReasonFromDescription(description: string): string {
  const m = /^Discount \((.*)\)$/.exec(String(description ?? "").trim());
  return m ? m[1] : String(description ?? "").trim();
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export type InvoiceStatusValue = "unpaid" | "partial" | "paid" | "house";

/** The payment status from the two money columns (DECIMAL(12,2), exact to the cent). */
export function invoicePaymentStatus(totalTtd: number, amountPaid: number, house = false): InvoiceStatusValue {
  if (house) return "house";
  const t = r2(totalTtd);
  const p = r2(amountPaid);
  if (t <= 0 && p >= t) return "paid";
  if (p <= 0) return "unpaid";
  if (p >= t) return "paid";
  return "partial";
}

export type InvoiceMoney<L extends MoneyLine> = {
  /** Every line EXCEPT the discount — the charge list (credit lines included). */
  chargeLines: L[];
  /** The owner's discount, positive TTD, or null. Already inside totalTtd. */
  discount: { amountTtd: number; reason: string } | null;
  /** ≤ 0 — referral / welcome credit (already inside totalTtd). Owner credits are NOT in it. */
  referralCreditTtd: number;
  /** The owner's added CREDIT lines and carried credits (amountTtd < 0), each under its own description. */
  ownerCredits: { description: string; amountTtd: number }[];
  /** What was charged before the discount: totalTtd + discount. */
  chargesTotalTtd: number;
  /** Zero for house invoices; otherwise total − paid, negative when overpaid. */
  balance: number;
  status: InvoiceStatusValue;
};

export function invoiceMoney<L extends MoneyLine>(lines: L[], totalTtd: number, amountPaid: number, house = false): InvoiceMoney<L> {
  const discountLines = lines.filter((l) => isDiscountLine(l));
  const chargeLines = lines.filter((l) => !isDiscountLine(l));
  const discountTtd = r2(-discountLines.reduce((a, l) => a + Number(l.amountTtd), 0));
  const referralCreditTtd = r2(
    chargeLines.reduce((a, l) => (l.lineType === "adjustment" || isOwnerLine(l) || isCarriedCreditLine(l) ? a : a + Math.min(0, Number(l.amountTtd))), 0)
  );
  const ownerCredits = chargeLines
    .filter((l) => (isOwnerLine(l) || isCarriedCreditLine(l)) && Number(l.amountTtd) < 0)
    .map((l) => ({ description: l.description, amountTtd: r2(Number(l.amountTtd)) }));
  return {
    chargeLines,
    discount: discountTtd > 0 ? { amountTtd: discountTtd, reason: discountReasonFromDescription(discountLines[0].description) } : null,
    referralCreditTtd,
    ownerCredits,
    chargesTotalTtd: r2(Number(totalTtd) + discountTtd),
    balance: house ? 0 : r2(Number(totalTtd) - Number(amountPaid)),
    status: invoicePaymentStatus(totalTtd, amountPaid, house),
  };
}

/**
 * What is left of a REFERRAL / WELCOME credit (Brent, 2026-10-25, migration 092).
 * A credit is spent in parts: each issued invoice takes what fits and the rest
 * waits for the next one. swiftbox_referral_credit_uses is the only record of
 * where it went; `liveUsedTtd` is the SUM of its uses whose invoice still exists
 * under that number and is not void (a void or deleted invoice gives the money
 * back with no write). `useRows` counts every use row, live or not.
 *
 * One guard for rows older than 092: a credit marked applied = 1 that has NO use
 * row at all was spent whole the old way and is read as used up, never as money
 * back. Never below 0. Money in TTD, exact to the cent.
 */
export function referralCreditRemaining(c: { amount: number; applied: number | boolean; useRows: number; liveUsedTtd: number }): number {
  if (Number(c.applied) === 1 && Number(c.useRows) === 0) return 0;
  return Math.max(0, r2(Number(c.amount) - Number(c.liveUsedTtd)));
}
