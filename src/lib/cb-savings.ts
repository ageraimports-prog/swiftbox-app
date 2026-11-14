import "server-only";
import { query } from "@/lib/db";
import { invoiceColumnExists } from "@/lib/house-accounts";

/**
 * Consolidated Billing savings — READ ONLY. The admin works the figure out when a
 * combined invoice is issued and stores it in swiftbox_cb_invoice_savings
 * (admin lib/cb-savings.ts, migration 113); the app only adds it up.
 *
 * A row counts only while its invoice is that invoice (id AND number — InnoDB can
 * reissue an id) and is ISSUED: a void invoice counts zero. House-account
 * invoices never count. Every reader answers null on any failure — before
 * migration 113 the table does not exist — and the counter simply does not show.
 */

const T = "swiftbox_cb_invoice_savings";
const LIVE = `i.invoice_id = s.invoice_id AND BINARY i.invoice_no = BINARY s.invoice_no AND i.lifecycle = 'issued'`;

async function notHouse(): Promise<string> {
  return (await invoiceColumnExists().catch(() => false)) ? "AND COALESCE(i.house_account, 0) = 0 AND i.status <> 'house'" : "AND i.status <> 'house'";
}

/** The customer's lifetime saving in TT$ (0 when none), or null when it can't be read. */
export async function lifetimeCbSavingsTtd(userId: number): Promise<number | null> {
  try {
    const rows = await query<{ t: string | null; house: number | null }>(
      `SELECT COALESCE(SUM(s.saving_ttd), 0) AS t,
              (SELECT COALESCE(MAX(u.house_account), 0) FROM users u WHERE u.id = :u) AS house
         FROM ${T} s JOIN swiftbox_invoices i ON ${LIVE}
        WHERE s.user_id = :u AND i.user_id = :u ${await notHouse()}`,
      { u: userId }
    );
    if (Number(rows[0]?.house ?? 0) === 1) return 0; // house accounts: no counter
    return Math.max(0, Math.round(Number(rows[0]?.t ?? 0) * 100) / 100);
  } catch {
    // A database without users.house_account, or without the snapshot table: try without the flag, else hide.
    try {
      const rows = await query<{ t: string | null }>(
        `SELECT COALESCE(SUM(s.saving_ttd), 0) AS t FROM ${T} s JOIN swiftbox_invoices i ON ${LIVE}
          WHERE s.user_id = :u AND i.user_id = :u ${await notHouse()}`,
        { u: userId }
      );
      return Math.max(0, Math.round(Number(rows[0]?.t ?? 0) * 100) / 100);
    } catch {
      return null;
    }
  }
}

/** The saving on one of the customer's issued invoices (TT$), or null (none / can't be read). */
export async function invoiceCbSavingTtd(userId: number, invoiceId: number): Promise<number | null> {
  try {
    const rows = await query<{ t: string }>(
      `SELECT s.saving_ttd AS t FROM ${T} s JOIN swiftbox_invoices i ON ${LIVE}
        WHERE s.invoice_id = :id AND i.user_id = :u ${await notHouse()} LIMIT 1`,
      { id: invoiceId, u: userId }
    );
    const v = Number(rows[0]?.t ?? 0);
    return v > 0 ? Math.round(v * 100) / 100 : null;
  } catch {
    return null;
  }
}
