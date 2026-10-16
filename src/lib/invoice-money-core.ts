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
 *     shipping figure.
 *   - STATUS is derived from total and paid, like the stored enum, but nothing
 *     owed (a total of 0 or less) is Paid even with no payment — an invoice
 *     discounted to 0 must never read as owing.
 */

export const DISCOUNT_LINE_TYPE = "other";
export const DISCOUNT_BASIS = "invoice discount";

export type MoneyLine = { lineType: string; description: string; amountTtd: number; basis: string | null };

export function isDiscountLine(l: { lineType: string; basis: string | null }): boolean {
  return l.lineType === DISCOUNT_LINE_TYPE && (l.basis ?? "").trim() === DISCOUNT_BASIS;
}

/** The reason back out of "Discount (reason)". */
export function discountReasonFromDescription(description: string): string {
  const m = /^Discount \((.*)\)$/.exec(String(description ?? "").trim());
  return m ? m[1] : String(description ?? "").trim();
}

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

export type InvoiceStatusValue = "unpaid" | "partial" | "paid";

/** The payment status from the two money columns (DECIMAL(12,2), exact to the cent). */
export function invoicePaymentStatus(totalTtd: number, amountPaid: number): InvoiceStatusValue {
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
  /** ≤ 0 — referral / welcome credit (already inside totalTtd). */
  referralCreditTtd: number;
  /** What was charged before the discount: totalTtd + discount. */
  chargesTotalTtd: number;
  /** total − paid; negative when overpaid. */
  balance: number;
  status: InvoiceStatusValue;
};

export function invoiceMoney<L extends MoneyLine>(lines: L[], totalTtd: number, amountPaid: number): InvoiceMoney<L> {
  const discountLines = lines.filter((l) => isDiscountLine(l));
  const chargeLines = lines.filter((l) => !isDiscountLine(l));
  const discountTtd = r2(-discountLines.reduce((a, l) => a + Number(l.amountTtd), 0));
  const referralCreditTtd = r2(
    chargeLines.reduce((a, l) => (l.lineType === "adjustment" ? a : a + Math.min(0, Number(l.amountTtd))), 0)
  );
  return {
    chargeLines,
    discount: discountTtd > 0 ? { amountTtd: discountTtd, reason: discountReasonFromDescription(discountLines[0].description) } : null,
    referralCreditTtd,
    chargesTotalTtd: r2(Number(totalTtd) + discountTtd),
    balance: r2(Number(totalTtd) - Number(amountPaid)),
    status: invoicePaymentStatus(totalTtd, amountPaid),
  };
}
