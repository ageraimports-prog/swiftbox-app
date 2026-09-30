import "server-only";
import { cache } from "react";
import { execute, query } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import { hasPrealertSql, needsPrealertSql } from "@/lib/prealert-needs";
import {
  arrivalDateLabel,
  carrierLabel,
  isPlayDemoSql,
  warehouseLabel,
  weightLabel,
  type PickPackage,
} from "@/lib/prealert-pick";

/**
 * Pick-to-prealert, server half. OWNERSHIP IS IN EVERY QUERY: each one filters
 * `p.user_id = :userId` with the session's users.id, so another customer's
 * package id answers exactly like a package that doesn't exist.
 *
 * The pre-alert is written to swiftbox_prealerts — the same table, and the same
 * tracking-string link, as the manual form (src/app/api/prealerts/route.ts).
 * Tracking, store, freight and piece count come ONLY from the package row; the
 * client supplies the description and the value, nothing else.
 */

type Row = {
  pk_id: number;
  tracking: string | null;
  shipper: string | null;
  weight: number | string | null;
  actual_weight: number | string | null;
  date: string | null;
  hialeah: number | string;
};

const COLUMNS = `p.pk_id, TRIM(p.tracking) AS tracking, p.shipper, p.weight, p.actual_weight,
                 DATE_FORMAT(p.date, '%Y-%m-%d') AS date, (p.airdrop_package_id IS NOT NULL) AS hialeah`;

function toPick(r: Row): PickPackage {
  return {
    pkId: Number(r.pk_id),
    tracking: r.tracking ?? "",
    carrier: carrierLabel(r.shipper),
    weightLb: weightLabel(r.weight, r.actual_weight),
    arrivedLabel: arrivalDateLabel(r.date),
    warehouse: warehouseLabel(r.hialeah),
  };
}

/** The customer's packages waiting for a pre-alert, oldest first. */
export async function listPackagesNeedingPrealert(userId: number): Promise<PickPackage[]> {
  const rows = await query<Row>(
    `SELECT ${COLUMNS}
       FROM mod_packages p
      WHERE p.user_id = :userId AND ${needsPrealertSql("p")}
      ORDER BY p.date ASC, p.pk_id ASC
      LIMIT 100`,
    { userId }
  );
  return rows.map(toPick);
}

/** How many — for the dashboard card and the tab badge. Deduplicated per request. */
export const countPackagesNeedingPrealert = cache(async (userId: number): Promise<number> => {
  const rows = await query<{ n: number | string }>(
    `SELECT COUNT(*) AS n FROM mod_packages p WHERE p.user_id = :userId AND ${needsPrealertSql("p")}`,
    { userId }
  );
  return Number(rows[0]?.n ?? 0) || 0;
});

export type PickState =
  | { state: "open"; pkg: PickPackage; demo: boolean }
  | { state: "prealerted"; demo: boolean }
  | { state: "closed" };

/**
 * Where this package stands for THIS customer. Not theirs / not found / on a
 * shipment / otherwise not needing one → closed. A linked pre-alert wins over
 * closed: "already pre-alerted" is the truer answer.
 */
export async function loadPickState(userId: number, pkId: number): Promise<PickState> {
  if (!Number.isInteger(pkId) || pkId <= 0) return { state: "closed" };
  const row = (await query<Row & { needs: number | string; has_prealert: number | string; demo: number | string }>(
    `SELECT ${COLUMNS}, ${needsPrealertSql("p")} AS needs, ${hasPrealertSql("p")} AS has_prealert,
            ${isPlayDemoSql("p")} AS demo
       FROM mod_packages p
      WHERE p.pk_id = :pkId AND p.user_id = :userId
      LIMIT 1`,
    { pkId, userId }
  ))[0];
  if (!row) return { state: "closed" };
  const demo = Number(row.demo) === 1;
  if (Number(row.has_prealert) === 1) return { state: "prealerted", demo };
  if (Number(row.needs) !== 1) return { state: "closed" };
  return { state: "open", pkg: toPick(row), demo };
}

/** What to open after this package: the oldest one still waiting (and, for the demo's dry run, only those after it). */
export async function nextAfter(userId: number, currentPkId: number): Promise<{ next: number | null; remaining: number }> {
  const list = await listPackagesNeedingPrealert(userId);
  const at = list.findIndex((p) => p.pkId === currentPkId);
  const rest = at >= 0 ? list.slice(at + 1) : list;
  return { next: rest[0]?.pkId ?? null, remaining: rest.length };
}

function isDeadlock(e: unknown): boolean {
  return e instanceof Error && /deadlock|lock wait timeout|1213|1205/i.test(e.message);
}

export type SubmitResult =
  | { status: "saved" | "already"; next: number | null; remaining: number; dryRun?: true }
  | { status: "closed" };

/**
 * Submit a picked pre-alert. ONE conditional INSERT … SELECT: the SELECT reads
 * the package with the ownership filter AND NEEDS_PREALERT, so the row is
 * written only while the package is this customer's, un-shipped and
 * un-pre-alerted — and every tracking/store/freight value comes from it.
 *
 * No duplicates, even on a double tap or two tabs: the NOT EXISTS inside
 * NEEDS_PREALERT sees any committed pre-alert, and on live (REPEATABLE-READ,
 * statement binlog) the SELECT half takes shared next-key locks on the
 * customer's swiftbox_prealerts range, so two concurrent inserts serialise —
 * one waits and then finds the other's row, or is the deadlock victim. Either
 * way the loser inserts nothing and is answered "already".
 *
 * The demo account is a dry run: validated, answered "saved", nothing written.
 */
export async function submitPickedPrealert(
  session: SessionUser,
  pkId: number,
  fields: { description: string; valueUsd: number }
): Promise<SubmitResult> {
  const before = await loadPickState(session.id, pkId);
  if (before.state === "closed") return { status: "closed" };
  if (before.state === "prealerted") return { status: "already", ...(await nextAfter(session.id, pkId)) };
  if (before.demo) return { status: "saved", dryRun: true, ...(await nextAfter(session.id, pkId)) };

  let inserted = 0;
  try {
    const res = await execute(
      `INSERT INTO swiftbox_prealerts
         (user_id, account_no, store_name, tracking_number, description,
          item_count, invoice_value_usd, freight_type)
       SELECT p.user_id, :accountNo, LEFT(COALESCE(NULLIF(TRIM(p.shipper), ''), 'Unknown'), 100),
              TRIM(p.tracking), :description, LEAST(GREATEST(p.pcs, 1), 255), :valueUsd,
              IF(p.pk_type = 2, 'SEA', 'AIR')
         FROM mod_packages p
        WHERE p.pk_id = :pkId AND p.user_id = :userId
          AND ${needsPrealertSql("p")}
          AND NOT ${isPlayDemoSql("p")}`,
      {
        accountNo: session.ac,
        description: fields.description,
        // DECIMAL(10,2) — a fixed-2dp string, as the manual form sends it.
        valueUsd: fields.valueUsd.toFixed(2),
        pkId,
        userId: session.id,
      }
    );
    inserted = Number(res.affectedRows) || 0;
  } catch (e) {
    if (!isDeadlock(e)) throw e;
  }

  if (inserted === 1) return { status: "saved", ...(await nextAfter(session.id, pkId)) };
  const after = await loadPickState(session.id, pkId);
  if (after.state === "prealerted") return { status: "already", ...(await nextAfter(session.id, pkId)) };
  return { status: "closed" };
}
