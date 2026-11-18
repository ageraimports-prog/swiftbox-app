import { query } from "@/lib/db";

/**
 * Invoices this customer has ALREADY paid by PayPal where the money is not on the
 * invoice ledger yet: being captured / recorded, PENDING at PayPal, "not yet
 * recorded" after the admin's automatic retries, or flagged and not cleared by
 * the office. The list shows them as "Payment processing", never as plain
 * "Unpaid" (admin 2026-11-18: a database deadlock left a paid invoice unrecorded).
 *
 * The rule is the admin's PAYPAL_IN_LIMBO_SQL (lib/paypal/core.ts) — keep the two
 * the same. READ ONLY. Never throws: before the admin's migrations 110 / 114 (or
 * any read failure) it answers "none", and the invoice page's Pay now still asks
 * the admin, which refuses a second payment on its own.
 */
const LIMBO = `(pp.status IN ('capturing','recording','pending','unrecorded') OR (pp.status = 'needs_review' AND pp.flag_cleared_at IS NULL))`;

export async function paypalProcessingInvoiceIds(userId: number, invoiceIds: number[]): Promise<Set<number>> {
  const ids = [...new Set(invoiceIds.map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return new Set();
  const list = ids.join(",");
  const out = new Set<number>();
  try {
    const one = await query<{ invoice_id: number }>(
      `SELECT pp.invoice_id FROM swiftbox_paypal_payments pp
        WHERE pp.user_id = :u AND pp.invoice_id IN (${list}) AND pp.payment_id IS NULL AND ${LIMBO}`,
      { u: userId }
    );
    for (const r of one) out.add(Number(r.invoice_id));
  } catch {
    return out;
  }
  try {
    const multi = await query<{ invoice_id: number }>(
      `SELECT oi.invoice_id FROM swiftbox_paypal_order_invoices oi JOIN swiftbox_paypal_payments pp ON pp.id = oi.row_id
        WHERE pp.user_id = :u AND oi.invoice_id IN (${list}) AND oi.payment_id IS NULL AND ${LIMBO}`,
      { u: userId }
    );
    for (const r of multi) out.add(Number(r.invoice_id));
  } catch {
    /* before 114: one invoice per attempt only */
  }
  return out;
}
