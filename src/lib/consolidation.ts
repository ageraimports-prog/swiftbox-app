import "server-only";
import { query, execute } from "@/lib/db";
import { sendConsolidationReleasedEmail } from "@/lib/consolidation-email";

/**
 * Consolidated Billing — the customer's side. See SwiftboxAdmin's
 * CONSOLIDATED_BILLING_PLAN.md; the admin (lib/consolidation.ts there) owns the
 * rules, and this module deliberately does only three things:
 *
 *   1. READ the customer's opt-in and their open holding group, including the
 *      "still expected" snapshot the admin writes (expected_count). This app
 *      never re-derives what is expected — one rule, one place.
 *   2. OPT IN / OUT (users.consolidated_billing). Business-tier and auto_hold
 *      customers cannot opt in: they are already billed on terms, and auto_hold
 *      is NOT consolidation.
 *   3. RELEASE the open group ("Deliver what's here now", or opting out) —
 *      the same conditional UPDATE the admin uses, so a race with the office or
 *      the daily cron releases it exactly once. The admin then drafts the one
 *      consolidated invoice on its next sweep.
 *
 * Times in swiftbox_consolidations are UTC.
 */

export type HoldGroup = {
  id: number;
  arrived: number;
  expectedCount: number;
  total: number;
  /** ISO, UTC. */
  holdUntil: string | null;
  /** "Mon 6 Oct" in Trinidad time. */
  deliverBy: string;
  pkIds: number[];
};

export type ConsolidationState = {
  optedIn: boolean;
  /** The admin setting consolidation_hold_days (default 10), for the explainer. */
  holdDays: number;
  eligible: boolean;
  ineligibleReason: string | null;
  group: HoldGroup | null;
};

function ineligibleReasonOf(rateTier: string, autoHold: boolean): string | null {
  if (rateTier === "business") return "Business accounts are billed on terms, so Consolidated Billing isn't available.";
  if (autoHold) return "Your account is billed on terms, so Consolidated Billing isn't available.";
  return null;
}

function utcDate(raw: string | null): Date | null {
  if (!raw) return null;
  const s = String(raw).trim().replace(" ", "T");
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function deliverByLabel(d: Date): string {
  return d.toLocaleDateString("en-TT", {
    timeZone: "America/Port_of_Spain",
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

async function openGroup(userId: number): Promise<HoldGroup | null> {
  const g = (
    await query<{ consolidation_id: number; hold_until: string | null; expected_count: number }>(
      `SELECT consolidation_id, hold_until, expected_count
         FROM swiftbox_consolidations
        WHERE open_user_id = :userId AND status = 'holding'
        LIMIT 1`,
      { userId }
    )
  )[0];
  if (!g) return null;
  const members = await query<{ pk_id: number }>(
    `SELECT pk_id FROM swiftbox_consolidation_packages
      WHERE consolidation_id = :id AND removed_at IS NULL`,
    { id: g.consolidation_id }
  );
  if (members.length === 0) return null;
  const until = utcDate(g.hold_until);
  const expected = Number(g.expected_count ?? 0);
  return {
    id: Number(g.consolidation_id),
    arrived: members.length,
    expectedCount: expected,
    total: members.length + expected,
    holdUntil: until?.toISOString() ?? null,
    deliverBy: until ? deliverByLabel(until) : "",
    pkIds: members.map((m) => Number(m.pk_id)),
  };
}

export async function getConsolidationState(userId: number): Promise<ConsolidationState> {
  const u = (
    await query<{ consolidated_billing: number; rate_tier: string; auto_hold: number }>(
      "SELECT consolidated_billing, rate_tier, auto_hold FROM users WHERE id = :userId LIMIT 1",
      { userId }
    )
  )[0];
  const setting = (
    await query<{ setting_value: string }>(
      "SELECT setting_value FROM swiftbox_settings WHERE setting_key = 'consolidation_hold_days' LIMIT 1"
    )
  )[0];
  const holdDays = Math.round(Number(setting?.setting_value ?? 10)) || 10;
  if (!u) return { optedIn: false, holdDays, eligible: false, ineligibleReason: null, group: null };
  const reason = ineligibleReasonOf(u.rate_tier, Number(u.auto_hold) === 1);
  return {
    optedIn: Number(u.consolidated_billing) === 1,
    holdDays,
    eligible: reason === null,
    ineligibleReason: reason,
    group: await openGroup(userId),
  };
}

/**
 * HOLDING → RELEASED, by the customer. Returns false when there was nothing
 * holding (already released by the office or the cron — not an error).
 * Sends the released notice itself and stamps released_notified_at, so the
 * admin's sweep does not send a second one.
 */
export async function releaseOpenGroup(userId: number, firstName: string, email: string): Promise<boolean> {
  const g = await openGroup(userId);
  if (!g) return false;
  const r = await execute(
    `UPDATE swiftbox_consolidations
        SET status = 'released', open_user_id = NULL, released_at = UTC_TIMESTAMP(),
            release_reason = 'customer', released_by = 'customer app'
      WHERE consolidation_id = :id AND user_id = :userId AND status = 'holding'`,
    { id: g.id, userId }
  );
  if (r.affectedRows === 0) return false;
  const claim = await execute(
    `UPDATE swiftbox_consolidations SET released_notified_at = UTC_TIMESTAMP()
      WHERE consolidation_id = :id AND released_notified_at IS NULL`,
    { id: g.id }
  );
  await execute(
    `UPDATE swiftbox_consolidation_packages SET joined_notified_at = UTC_TIMESTAMP()
      WHERE consolidation_id = :id AND joined_notified_at IS NULL`,
    { id: g.id }
  );
  if (claim.affectedRows > 0 && email.trim()) {
    try {
      await sendConsolidationReleasedEmail({ to: email.trim(), firstName, count: g.arrived });
    } catch (e) {
      console.error("[consolidation] released email failed:", e instanceof Error ? e.message : e);
    }
  }
  return true;
}

/** Opt in or out. Opting OUT releases any open group straight away. */
export async function setOptIn(
  userId: number,
  on: boolean,
  firstName: string,
  email: string
): Promise<ConsolidationState> {
  const state = await getConsolidationState(userId);
  if (on && !state.eligible) throw new Error(state.ineligibleReason ?? "Consolidated Billing isn't available on this account.");
  await execute("UPDATE users SET consolidated_billing = :v WHERE id = :userId", { v: on ? 1 : 0, userId });
  if (!on) await releaseOpenGroup(userId, firstName, email);
  return getConsolidationState(userId);
}

/** pk_id → true for the customer's packages currently HELD (for the package list). */
export async function heldPackageIds(userId: number): Promise<Set<number>> {
  const rows = await query<{ pk_id: number }>(
    `SELECT cp.pk_id
       FROM swiftbox_consolidation_packages cp
       JOIN swiftbox_consolidations c ON c.consolidation_id = cp.consolidation_id
      WHERE c.user_id = :userId AND c.status = 'holding' AND cp.removed_at IS NULL`,
    { userId }
  );
  return new Set(rows.map((r) => Number(r.pk_id)));
}
