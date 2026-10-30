import "server-only";
import { execute, query } from "@/lib/db";
import { prealertFacingStatus } from "@/lib/customer-facing-status-core";
import { prealertMatchedSql } from "@/lib/prealert-lock-sql";

/**
 * Pre-alerts with NO package checked in yet, and the admin's missing-check-in
 * flags on them (admin migration 091, swiftbox_prealert_flags — written ONLY by
 * the admin's hourly cron; this app reads it and marks its notice read).
 *
 * R4 (Brent, 2026-10-23): a customer may see "Not yet received in Miami" for a
 * pre-alert, or "Flagged — checking with warehouse" once the office has flagged
 * it. The label is the shared rule's (customer-facing-status-core.ts). Never a
 * count, never a location beyond Miami. Every read fails soft: the table may
 * not exist yet.
 */
export type PrealertRowOut = {
  id: number;
  tracking: string;
  storeName: string;
  description: string;
  createdAt: string;
  status: { label: string; flagged: boolean };
};

const FLAGS = "swiftbox_prealert_flags";

/** The customer's active flags, keyed by v2 prealert_id. Never throws. */
export async function activePrealertFlags(userId: number): Promise<Map<number, { flagId: number; tracking: string; flaggedAt: string; appStatus: string }>> {
  const out = new Map<number, { flagId: number; tracking: string; flaggedAt: string; appStatus: string }>();
  try {
    const rows = await query<{ flag_id: number; prealert_id: number; tracking: string; flagged_at: string; app_status: string }>(
      `SELECT flag_id, prealert_id, tracking, DATE_FORMAT(flagged_at, '%Y-%m-%dT%H:%i:%sZ') AS flagged_at, app_status
         FROM ${FLAGS} WHERE user_id = :userId AND source = 'v2' AND cleared_at IS NULL`,
      { userId }
    );
    for (const r of rows) out.set(Number(r.prealert_id), { flagId: Number(r.flag_id), tracking: r.tracking, flaggedAt: r.flagged_at, appStatus: r.app_status });
  } catch {
    // Table missing (091 not run) / bridge hiccup → no flags.
  }
  return out;
}

/** The customer's pre-alerts (app table) that have no package yet, with the R4 status. Never throws. */
export async function openPrealertRows(userId: number, consolidated = false): Promise<PrealertRowOut[]> {
  try {
    const [rows, flags] = await Promise.all([
      query<{ prealert_id: number; tracking_number: string; store_name: string; description: string | null; created_at: string }>(
        `SELECT sp.prealert_id, sp.tracking_number, sp.store_name, sp.description, sp.created_at
           FROM swiftbox_prealerts sp
          WHERE sp.user_id = :userId AND LENGTH(TRIM(sp.tracking_number)) > 0 AND NOT ${prealertMatchedSql("sp")}
          ORDER BY sp.created_at DESC`,
        { userId }
      ),
      activePrealertFlags(userId),
    ]);
    return rows.map((r) => ({
      id: Number(r.prealert_id),
      tracking: String(r.tracking_number).trim(),
      storeName: String(r.store_name ?? "").trim(),
      description: String(r.description ?? "").trim(),
      createdAt: String(r.created_at),
      // A consolidating customer's pre-alert names no place (Brent, 2026-10-29).
      status: prealertFacingStatus({ flagged: flags.has(Number(r.prealert_id)), consolidated }),
    }));
  } catch {
    return [];
  }
}

/** Flag notices for the Notices page (active flags, newest first). Never throws. */
export async function flagNotices(userId: number): Promise<{ flagId: number; prealertId: number; tracking: string; storeName: string; flaggedAt: string; unread: boolean }[]> {
  try {
    const rows = await query<{ flag_id: number; prealert_id: number; tracking: string; store_name: string | null; flagged_at: string; app_status: string }>(
      `SELECT f.flag_id, f.prealert_id, f.tracking, sp.store_name, DATE_FORMAT(f.flagged_at, '%Y-%m-%dT%H:%i:%sZ') AS flagged_at, f.app_status
         FROM ${FLAGS} f LEFT JOIN swiftbox_prealerts sp ON sp.prealert_id = f.prealert_id AND f.source = 'v2'
        WHERE f.user_id = :userId AND f.cleared_at IS NULL ORDER BY f.flagged_at DESC LIMIT 50`,
      { userId }
    );
    return rows.map((r) => ({ flagId: Number(r.flag_id), prealertId: Number(r.prealert_id), tracking: r.tracking, storeName: String(r.store_name ?? "").trim(), flaggedAt: r.flagged_at, unread: r.app_status === "unread" }));
  } catch {
    return [];
  }
}

/** Unread flag notices, for the header badge. Never throws. */
export async function unreadFlagCount(userId: number): Promise<number> {
  try {
    const rows = await query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${FLAGS} WHERE user_id = :userId AND cleared_at IS NULL AND app_status = 'unread'`, { userId });
    return Number(rows[0]?.n ?? 0);
  } catch {
    return 0;
  }
}

/** The customer read the notice — the ONE write this app makes to the table (its own row only). */
export async function markFlagRead(userId: number, flagId: number): Promise<void> {
  await execute(`UPDATE ${FLAGS} SET app_status = 'read' WHERE flag_id = :flagId AND user_id = :userId AND app_status = 'unread'`, { flagId, userId });
}
