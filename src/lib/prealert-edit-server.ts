import "server-only";
import { del } from "@vercel/blob";
import { execute, query } from "@/lib/db";
import type { SessionUser } from "@/lib/session";
import { PLAY_DEMO_EMAIL, PLAY_DEMO_TRACKING_PREFIX } from "@/lib/prealert-pick";
import { packageClearedSql, packageInvoicedSql, prealertLockedSql } from "@/lib/prealert-lock-sql";
import {
  cancelAuditChanges,
  canonicalFromRow,
  CUSTOMER_CANCEL_ACTION,
  CUSTOMER_EDIT_ACTION,
  CUSTOMER_FIELD_KEYS,
  customerAuditActor,
  customerCanEditTracking,
  customerRelinkLocked,
  isCustomerLocked,
  LOCKED_MESSAGE,
  planCustomerCancel,
  planCustomerEdit,
  prealertAuditId,
  STALE_MESSAGE,
  V2_FIELDS,
  type FieldChange,
  type FieldKey,
  type LinkedPackage,
  type PrealertValues,
} from "@/lib/prealert-edit-core";

/**
 * The customer's OWN pre-alert: read for the edit form, edit, cancel.
 *
 * OWNERSHIP IS IN EVERY QUERY: `prealert_id = :id AND user_id = :userId` with
 * the session's users.id, so another customer's id answers exactly like one
 * that doesn't exist (404).
 *
 * The rules are the admin's (prealert-edit-core.ts, a byte-identical twin of
 * SwiftboxAdmin lib/prealert-edit-core.ts): same validator, same stale-form
 * check, plus the customer's lock — a pre-alert whose matched package is
 * cleared or invoiced is read-only (prealert-lock-sql.ts holds the SQL). Only
 * store, description, item count, value and freight are customer-editable;
 * tracking only while no package matches it. Never status or notes.
 *
 * WRITES mirror SwiftboxAdmin lib/prealert-edit.ts `updatePrealert`: ONE
 * conditional UPDATE (changed columns only, LIMIT 1, refused if a column moved
 * since the form loaded). Every edit and cancel writes swiftbox_audit_log rows
 * in the owner's format (entity 'prealert', id "v2:<id>", one row per field,
 * from → to) with action customer_prealert_edit / customer_prealert_cancel and
 * actor "customer:<users.id>" — the admin's "Edited by customer" marker reads
 * them. An audit write never fails the customer's change.
 *
 * The Play demo account (#0364) is a dry run everywhere: validated, answered
 * ok, nothing written.
 */

export type OwnPrealert = {
  id: number;
  values: PrealertValues;
  links: LinkedPackage[];
  locked: boolean;
  canEditTracking: boolean;
  hasFile: boolean;
  demo: boolean;
};

/** What the edit form needs — no notes, no WR, no package internals. */
export type OwnPrealertView = {
  id: number;
  values: Pick<PrealertValues, "tracking" | "store" | "description" | "itemCount" | "value" | "freight">;
  status: string;
  locked: boolean;
  lockMessage: string | null;
  canEditTracking: boolean;
  hasFile: boolean;
};

export type EditResult =
  | { ok: true; changed: number; prealert: OwnPrealertView | null }
  | { ok: false; status: 404 | 409 | 422; error: string; errors?: Partial<Record<FieldKey, string>>; locked?: true; conflict?: true };

/** The lock, re-checked INSIDE the write so a clearance landing mid-edit still refuses it. */
const LOCK_GUARD = prealertLockedSql("swiftbox_prealerts");

function validId(id: unknown): number | null {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** The packages a tracking links to for one customer, with cleared / invoiced. */
export async function linkedPackagesFor(userId: number, tracking: string): Promise<LinkedPackage[]> {
  const t = String(tracking ?? "").trim();
  if (!t || !Number.isInteger(userId) || userId <= 0) return [];
  const rows = await query<{ pk_id: number; wr: string | null; ship_no: string | null; cleared: number | string; invoiced: number | string }>(
    `SELECT pk.pk_id, pk.wr,
            (SELECT s.ship_no FROM mod_shipment s WHERE s.package_id = pk.pk_id ORDER BY s.ship_id DESC LIMIT 1) AS ship_no,
            ${packageClearedSql("pk")} AS cleared,
            ${packageInvoicedSql("pk")} AS invoiced
       FROM mod_packages pk
      WHERE pk.user_id = :userId AND TRIM(pk.tracking) = :t
      ORDER BY pk.pk_id DESC`,
    { userId, t }
  );
  return rows.map((r) => ({
    pkId: Number(r.pk_id),
    wr: (r.wr ?? "").trim(),
    shipNo: (r.ship_no ?? "").trim() || null,
    cleared: Number(r.cleared) === 1,
    invoiced: Number(r.invoiced) === 1,
  }));
}

export async function loadOwnPrealert(session: SessionUser, id: number): Promise<OwnPrealert | null> {
  const pid = validId(id);
  if (!pid) return null;
  const cols = V2_FIELDS.map((f) => `sp.${f.column}`).join(", ");
  const [row] = await query<Record<string, unknown>>(
    `SELECT sp.prealert_id, ${cols},
            (SELECT COUNT(*) FROM swiftbox_prealert_files f WHERE f.prealert_id = sp.prealert_id) AS has_file,
            (sp.user_id IN (SELECT id FROM users WHERE email = :demoEmail) OR sp.tracking_number LIKE :demoPrefix) AS demo
       FROM swiftbox_prealerts sp
      WHERE sp.prealert_id = :id AND sp.user_id = :userId
      LIMIT 1`,
    { id: pid, userId: session.id, demoEmail: PLAY_DEMO_EMAIL, demoPrefix: `${PLAY_DEMO_TRACKING_PREFIX}%` }
  ).catch(async (e) => {
    // swiftbox_prealert_files may not exist (migration 041) — read without it.
    if (!(e instanceof Error && /swiftbox_prealert_files/.test(e.message))) throw e;
    return query<Record<string, unknown>>(
      `SELECT sp.prealert_id, ${cols}, 0 AS has_file,
              (sp.user_id IN (SELECT id FROM users WHERE email = :demoEmail) OR sp.tracking_number LIKE :demoPrefix) AS demo
         FROM swiftbox_prealerts sp
        WHERE sp.prealert_id = :id AND sp.user_id = :userId
        LIMIT 1`,
      { id: pid, userId: session.id, demoEmail: PLAY_DEMO_EMAIL, demoPrefix: `${PLAY_DEMO_TRACKING_PREFIX}%` }
    );
  });
  if (!row) return null;
  const values = canonicalFromRow("v2", row);
  const links = await linkedPackagesFor(session.id, values.tracking ?? "");
  return {
    id: pid,
    values,
    links,
    locked: isCustomerLocked(links),
    canEditTracking: customerCanEditTracking(links),
    hasFile: Number(row.has_file) > 0,
    demo: Number(row.demo) === 1,
  };
}

export function viewOf(p: OwnPrealert): OwnPrealertView {
  const v = p.values;
  return {
    id: p.id,
    values: {
      tracking: v.tracking ?? "",
      store: v.store ?? "",
      description: v.description ?? "",
      itemCount: v.itemCount ?? "",
      value: v.value ?? "",
      freight: v.freight ?? "",
    },
    status: v.status ?? "",
    locked: p.locked,
    lockMessage: p.locked ? LOCKED_MESSAGE : null,
    canEditTracking: p.canEditTracking,
    hasFile: p.hasFile,
  };
}

/** The customer-visible part of what the form loaded — status and notes are never compared. */
function customerExpected(expected: unknown): PrealertValues | undefined {
  if (!expected || typeof expected !== "object") return undefined;
  const out: PrealertValues = {};
  for (const k of CUSTOMER_FIELD_KEYS) {
    const v = (expected as Record<string, unknown>)[k];
    if (v !== undefined && v !== null) out[k] = String(v);
  }
  return out;
}

async function audit(session: SessionUser, id: number, action: string, changes: FieldChange[], extraNote = "") {
  for (const c of changes) {
    try {
      await execute(
        `INSERT INTO swiftbox_audit_log (entity_type, entity_id, action, from_value, to_value, actor, logged_at, note)
         VALUES ('prealert', :entityId, :action, :from, :to, :actor, NOW(), :note)`,
        {
          entityId: prealertAuditId("v2", id),
          action,
          from: c.from === "" ? null : c.from.slice(0, 255),
          to: c.to === "" ? null : c.to.slice(0, 255),
          actor: customerAuditActor(session.id),
          note: `field ${c.column}${extraNote}`.slice(0, 255),
        }
      );
    } catch (e) {
      console.error("[prealert-edit] audit write failed:", e instanceof Error ? e.message : e);
    }
  }
}

/** Why a conditional write matched nothing: locked now, or the form went stale. */
async function refusalAfterMiss(session: SessionUser, id: number): Promise<EditResult> {
  const now = await loadOwnPrealert(session, id);
  if (!now) return { ok: false, status: 404, error: "Not found." };
  if (now.locked) return { ok: false, status: 409, error: LOCKED_MESSAGE, locked: true };
  return { ok: false, status: 409, error: STALE_MESSAGE, conflict: true };
}

/** PATCH — the customer edits their own pre-alert. */
export async function customerEditPrealert(
  session: SessionUser,
  id: number,
  fields: Record<string, unknown>,
  expected: unknown
): Promise<EditResult> {
  const current = await loadOwnPrealert(session, id);
  if (!current) return { ok: false, status: 404, error: "Not found." };

  const plan = planCustomerEdit({
    current: current.values,
    links: current.links,
    fields,
    expected: customerExpected(expected),
  });
  if (!plan.ok) return plan;
  if (plan.trackingChanged && customerRelinkLocked(await linkedPackagesFor(session.id, plan.values.tracking ?? ""))) {
    return { ok: false, status: 409, error: LOCKED_MESSAGE, locked: true };
  }
  if (!plan.changes.length || current.demo) return { ok: true, changed: 0, prealert: viewOf(current) };

  const sets: string[] = [];
  const guards: string[] = [];
  const params: Record<string, unknown> = { id: current.id, userId: session.id };
  plan.changes.forEach((c, i) => {
    sets.push(`${c.column} = :n${i}`);
    params[`n${i}`] = c.key === "itemCount" ? Number(c.to) : c.to;
    guards.push(`COALESCE(TRIM(${c.column}), '') = :o${i}`);
    params[`o${i}`] = c.from;
  });
  const res = await execute(
    `UPDATE swiftbox_prealerts SET ${sets.join(", ")}
      WHERE prealert_id = :id AND user_id = :userId AND ${guards.join(" AND ")}
        AND NOT ${LOCK_GUARD}
      LIMIT 1`,
    params
  );
  if (Number(res.affectedRows) !== 1) return refusalAfterMiss(session, current.id);

  await audit(session, current.id, CUSTOMER_EDIT_ACTION, plan.changes);
  const after = await loadOwnPrealert(session, current.id);
  return { ok: true, changed: plan.changes.length, prealert: after ? viewOf(after) : null };
}

/** DELETE — the customer cancels their own pre-alert (and its invoice file). */
export async function customerCancelPrealert(session: SessionUser, id: number, expected: unknown): Promise<EditResult> {
  const current = await loadOwnPrealert(session, id);
  if (!current) return { ok: false, status: 404, error: "Not found." };
  const plan = planCustomerCancel({ current: current.values, links: current.links, expected: customerExpected(expected) });
  if (!plan.ok) return plan;
  if (current.demo) return { ok: true, changed: 0, prealert: null };

  // Guarded on every customer-visible column, like the edit: a change since
  // the list loaded refuses the cancel rather than deleting something else.
  const guards: string[] = [];
  const params: Record<string, unknown> = { id: current.id, userId: session.id };
  CUSTOMER_FIELD_KEYS.forEach((k, i) => {
    const f = V2_FIELDS.find((x) => x.key === k)!;
    guards.push(`COALESCE(TRIM(${f.column}), '') = :o${i}`);
    params[`o${i}`] = current.values[k] ?? "";
  });
  const res = await execute(
    `DELETE FROM swiftbox_prealerts
      WHERE prealert_id = :id AND user_id = :userId AND ${guards.join(" AND ")}
        AND NOT ${LOCK_GUARD}
      LIMIT 1`,
    params
  );
  if (Number(res.affectedRows) !== 1) return refusalAfterMiss(session, current.id);

  await audit(session, current.id, CUSTOMER_CANCEL_ACTION, cancelAuditChanges(current.values), "; cancelled by customer");
  if (current.hasFile) await removeFile(session, current.id);
  return { ok: true, changed: 1, prealert: null };
}

/** The cancelled pre-alert's invoice: row first, then the private blob. Never throws. */
async function removeFile(session: SessionUser, prealertId: number): Promise<void> {
  try {
    const [f] = await query<{ file_id: number; blob_url: string }>(
      `SELECT file_id, blob_url FROM swiftbox_prealert_files WHERE prealert_id = :prealertId AND user_id = :userId LIMIT 1`,
      { prealertId, userId: session.id }
    );
    if (!f) return;
    await execute(`DELETE FROM swiftbox_prealert_files WHERE file_id = :fileId AND user_id = :userId LIMIT 1`, {
      fileId: f.file_id,
      userId: session.id,
    });
    const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
    if (token && f.blob_url) await del(f.blob_url, { token }).catch(() => {});
  } catch (e) {
    console.error("[prealert-edit] file cleanup failed:", e instanceof Error ? e.message : e);
  }
}

/** For prealert-file-server.ts: one audit row when the customer replaces their invoice. */
export async function auditFileReplaced(session: SessionUser, prealertId: number, from: string | null, to: string | null) {
  await audit(session, prealertId, CUSTOMER_EDIT_ACTION, [
    { key: "notes", column: "invoice_file", label: "Invoice file", from: from ?? "(file)", to: to ?? "(file)" },
  ]);
}
