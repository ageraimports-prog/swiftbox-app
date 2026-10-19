import "server-only";
import { query } from "@/lib/db";
import { CUSTOMER_STATUS_TABLE, OVERRIDE_SET_AT_SQL, type StoredOverride } from "@/lib/customer-status-core";
import { customerFacingView, invoiceIssuedAtSql, type CbMembership, type CustomerFacingView } from "@/lib/customer-facing-status-core";

/**
 * Customer-facing status set by the office (admin migration 055,
 * swiftbox_customer_status_overrides). READ ONLY here — the admin is the only
 * writer, and this app never writes the table. Rules in customer-status-core.ts
 * (code-identical to the admin's copy).
 *
 * A separate query, never a JOIN, and it never throws: if the table doesn't
 * exist yet (or the read fails) every package simply shows its normal status.
 */
export async function customerStatusOverrides(userId: number, pkIds: number[]): Promise<Map<number, StoredOverride>> {
  const out = new Map<number, StoredOverride>();
  const ids = [...new Set(pkIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  if (ids.length === 0) return out;
  try {
    // ids are validated positive integers → safe to inline. The user_id join is
    // the ownership check: another customer's package can never be matched.
    const rows = await query<{ pk_id: number; override_key: string; note: string | null; base_stage: number; set_at: string | null }>(
      `SELECT o.pk_id, o.override_key, o.note, o.base_stage, ${OVERRIDE_SET_AT_SQL} AS set_at
         FROM ${CUSTOMER_STATUS_TABLE} o
         JOIN mod_packages p ON p.pk_id = o.pk_id AND p.user_id = :userId
        WHERE o.pk_id IN (${ids.join(",")})`,
      { userId }
    );
    for (const r of rows) {
      out.set(Number(r.pk_id), { key: String(r.override_key), note: r.note, baseStage: Number(r.base_stage), setAt: r.set_at });
    }
  } catch {
    // Table missing / bridge hiccup → normal status everywhere.
  }
  return out;
}

/**
 * What the customer sees for one package — through THE shared rule,
 * customer-facing-status-core.ts (code-identical with the admin and the
 * website): the office's status, Consolidated Billing ("Consolidating" from
 * the moment a member leaves Miami until its group's bill is issued), the 5 pm
 * drop, then the real stage. `rawShipStatus` is the package's own shipment row
 * (null = none), `cleared` its shipment's clearance, `airdrop` the Airdrop
 * receive time + mode (absent for packages Airdrop never received).
 */
export function viewFor(input: {
  override?: StoredOverride;
  rawShipStatus: number | null;
  cleared: boolean;
  pkType: number | null;
  cb?: CbMembership | null;
  airdrop?: { receivedAt: string | null; mode: string | null };
  /** The package's ISSUED invoice (INVOICE_ISSUED_AT_SQL); null = on none. */
  invoiceIssuedAt?: string | null;
  nowMs?: number;
}): CustomerFacingView {
  return customerFacingView({
    shipStatus: input.rawShipStatus,
    cleared: input.cleared,
    pkType: input.pkType,
    override: input.override ?? null,
    cb: input.cb ?? null,
    airdrop: input.airdrop ?? null,
    invoiceIssuedAt: input.invoiceIssuedAt ?? null,
    nowMs: input.nowMs,
  });
}

/**
 * SQL: the issued_at of the package `p`'s ISSUED invoice ('' = no time), NULL
 * when on none — an issued invoice means the customer sees Cleared – Ready to
 * Deliver (Brent, 2026-10-19). The shared core's query, so the app, the website
 * and the admin read the same fact.
 */
export const INVOICE_ISSUED_AT_SQL = invoiceIssuedAtSql("p.pk_id");

/** SQL: 1 when the shipment row aliased `s` has been marked cleared (admin migration 017). */
export const CLEARED_SQL = "(SELECT COUNT(*) FROM swiftbox_shipment_clearance sc WHERE sc.ship_no = s.ship_no) > 0";
