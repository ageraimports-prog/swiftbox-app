import { query } from "@/lib/db";

/**
 * Carried credits (admin migration 082, admin lib/invoice-void.ts): what a
 * customer had paid on an invoice that was voided because a package did not
 * arrive. The admin takes it off the next invoice as "Credit from INV-…" and,
 * when that invoice is smaller, carries the rest to the customer's following
 * invoices until it is used up. Each application is a row in
 * swiftbox_carried_credit_uses; a use on a void or deleted invoice does not
 * count. Read only here — the app never writes these tables.
 *
 * Before 082 is on the database the tables are missing: this answers [] and
 * the invoices page shows nothing.
 */
export type CarriedCreditBalance = { name: string; remainingTtd: number };

export async function carriedCreditBalances(userId: number): Promise<CarriedCreditBalance[]> {
  try {
    const rows = await query<{ source_invoice_no: string; amount_ttd: string; used: string | null }>(
      `SELECT c.source_invoice_no, c.amount_ttd,
              (SELECT SUM(u.amount_ttd) FROM swiftbox_carried_credit_uses u
                 JOIN swiftbox_invoices x ON x.invoice_id = u.invoice_id AND x.invoice_no = u.invoice_no
                  AND x.lifecycle IN ('draft','held','issued')
                WHERE u.credit_id = c.id) AS used
         FROM swiftbox_carried_credits c
        WHERE c.user_id = :userId
        ORDER BY c.id`,
      { userId }
    );
    const out: CarriedCreditBalance[] = [];
    for (const r of rows) {
      const remaining = Math.max(0, Math.round((Number(r.amount_ttd) - Number(r.used ?? 0)) * 100) / 100);
      if (remaining > 0) out.push({ name: `Credit from ${r.source_invoice_no}`, remainingTtd: remaining });
    }
    return out;
  } catch {
    return [];
  }
}
