import "server-only";
import { query } from "@/lib/db";
import { invoiceColumnExists } from "@/lib/house-accounts";

/**
 * "Your savings" — READ ONLY (admin CARD_DISCOUNT_PLAN.md). Two sources, each the
 * admin's own record, never re-worked out here:
 *   card          swiftbox_customer_savings (migration 114): one row per captured,
 *                 discounted PayPal order; a full refund sets reversed_at.
 *   consolidated  swiftbox_cb_invoice_savings (migration 113): one row per ISSUED
 *                 combined invoice; a void invoice counts zero (the same join as
 *                 src/lib/cb-savings.ts).
 * Every reader answers null on any failure — before 114 / 113 the tables do not
 * exist — and the card simply does not show. No count of packages or invoices is
 * ever returned.
 */

export type SavingsSummary = {
  totalTtd: number;
  cardTtd: number;
  cbTtd: number;
  latest: { type: "card" | "consolidated"; amountTtd: number; at: string } | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

async function cardPart(userId: number): Promise<{ total: number; latest: { amount: number; at: string } | null } | null> {
  try {
    const [t] = await query<{ t: string | null }>(
      `SELECT COALESCE(SUM(amount_ttd), 0) AS t FROM swiftbox_customer_savings WHERE user_id = :u AND type = 'card' AND reversed_at IS NULL`,
      { u: userId }
    );
    const [l] = await query<{ amount_ttd: string; created_at: string }>(
      `SELECT amount_ttd, created_at FROM swiftbox_customer_savings WHERE user_id = :u AND type = 'card' AND reversed_at IS NULL AND amount_ttd > 0 ORDER BY created_at DESC, id DESC LIMIT 1`,
      { u: userId }
    );
    return { total: Number(t?.t ?? 0), latest: l ? { amount: Number(l.amount_ttd), at: `${String(l.created_at).replace(" ", "T")}Z` } : null };
  } catch {
    return null;
  }
}

async function cbPart(userId: number): Promise<{ total: number; latest: { amount: number; at: string } | null } | null> {
  const LIVE = `i.invoice_id = s.invoice_id AND BINARY i.invoice_no = BINARY s.invoice_no AND i.lifecycle = 'issued'`;
  const house = (await invoiceColumnExists().catch(() => false)) ? "AND COALESCE(i.house_account, 0) = 0 AND i.status <> 'house'" : "AND i.status <> 'house'";
  try {
    const [t] = await query<{ t: string | null }>(
      `SELECT COALESCE(SUM(s.saving_ttd), 0) AS t FROM swiftbox_cb_invoice_savings s JOIN swiftbox_invoices i ON ${LIVE}
        WHERE s.user_id = :u AND i.user_id = :u ${house}`,
      { u: userId }
    );
    // issued_at is the invoice's own clock (DB time, not UTC): shown as a date only.
    const [l] = await query<{ saving_ttd: string; issued_at: string | null }>(
      `SELECT s.saving_ttd, i.issued_at FROM swiftbox_cb_invoice_savings s JOIN swiftbox_invoices i ON ${LIVE}
        WHERE s.user_id = :u AND i.user_id = :u AND s.saving_ttd > 0 ${house}
        ORDER BY i.issued_at DESC, i.invoice_id DESC LIMIT 1`,
      { u: userId }
    );
    return { total: Number(t?.t ?? 0), latest: l && l.issued_at ? { amount: Number(l.saving_ttd), at: String(l.issued_at).slice(0, 10) } : null };
  } catch {
    return null;
  }
}

/** The customer's lifetime savings, or null when neither source can be read. */
export async function savingsSummary(userId: number): Promise<SavingsSummary | null> {
  const [card, cb] = await Promise.all([cardPart(userId), cbPart(userId)]);
  if (!card && !cb) return null;
  const cardTtd = r2(Math.max(0, card?.total ?? 0));
  const cbTtd = r2(Math.max(0, cb?.total ?? 0));
  const candidates: SavingsSummary["latest"][] = [
    card?.latest ? { type: "card", amountTtd: r2(card.latest.amount), at: card.latest.at } : null,
    cb?.latest ? { type: "consolidated", amountTtd: r2(cb.latest.amount), at: cb.latest.at } : null,
  ];
  const latest = candidates.filter(Boolean).sort((a, b) => (a!.at < b!.at ? 1 : -1))[0] ?? null;
  return { totalTtd: r2(cardTtd + cbTtd), cardTtd, cbTtd, latest };
}
