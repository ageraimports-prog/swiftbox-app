import "server-only";
import { query } from "@/lib/db";
import { isAutoTransitDue } from "@/lib/auto-transit-core";
import {
  CUSTOMER_STATUS_TABLE,
  customerStageOf,
  customerStatusView,
  type CustomerStatusView,
  type StoredOverride,
} from "@/lib/customer-status-core";

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
    const rows = await query<{ pk_id: number; override_key: string; note: string | null; base_stage: number }>(
      `SELECT o.pk_id, o.override_key, o.note, o.base_stage
         FROM ${CUSTOMER_STATUS_TABLE} o
         JOIN mod_packages p ON p.pk_id = o.pk_id AND p.user_id = :userId
        WHERE o.pk_id IN (${ids.join(",")})`,
      { userId }
    );
    for (const r of rows) {
      out.set(Number(r.pk_id), { key: String(r.override_key), note: r.note, baseStage: Number(r.base_stage) });
    }
  } catch {
    // Table missing / bridge hiccup → normal status everywhere.
  }
  return out;
}

/**
 * What to show instead of the normal status, from the package's RAW
 * ship_status (its own shipment row, before any Consolidated Billing masking)
 * and whether it is in an unreleased group. Null = the normal status.
 * `airdrop` = the Airdrop receive time + mode for the 5 pm In Transit rule
 * (auto-transit-core.ts); absent for packages Airdrop never received.
 */
export function viewFor(
  o: StoredOverride | undefined,
  rawShipStatus: number | null,
  grouped: boolean,
  airdrop?: { receivedAt: string | null; mode: string | null },
  nowMs: number = Date.now()
): CustomerStatusView | null {
  const auto = airdrop ? isAutoTransitDue(airdrop.receivedAt, airdrop.mode, nowMs) : false;
  return customerStatusView(o, customerStageOf(rawShipStatus), grouped, auto);
}
