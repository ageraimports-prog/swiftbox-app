/**
 * What a CUSTOMER sees as a package's status — THE one rule. PURE (no I/O).
 *
 * THIS FILE IS CODE-IDENTICAL IN THREE REPOS: SwiftboxAdmin
 * `lib/customer-facing-status-core.ts`, SwiftboxApp
 * `src/lib/customer-facing-status-core.ts` and the website's
 * `src/lib/customer-facing-status-core.ts`. Change all three together. It
 * imports only the two other code-identical cores.
 *
 * Every customer surface goes through `customerFacingView`: the customer app
 * (package list, package page), the public tracker (/api/track), the WhatsApp
 * bot's lookup (/api/agent/packages) — and the admin's "Customer sees" column,
 * so the office sees exactly what the customer sees. Each surface only gathers
 * the facts (raw ship_status, clearance, the office's override, Consolidated
 * Billing membership, the Airdrop receive time) and asks this.
 *
 * ORDER
 *  G. CONSOLIDATED BILLING GROUP STATUS (Brent, 2026-10-23) — first, for an
 *     ACTIVE member whose own package is not Out for Delivery / Delivered, when
 *     the surface read the group facts (CB_MEMBERSHIP_SELECT does):
 *       - group still collecting (an OPEN group: before Send now / opt-out /
 *         a release): "Consolidating" for EVERY member from the moment it joins,
 *         wherever it physically is — In Miami, shipped, in the air, landed,
 *         clearing, cleared, held (Brent, 2026-10-26, Koren Small SWIFT-1006:
 *         replaces the 23 Oct R1 "Received in Miami" step, which made members
 *         still in Miami read as if nothing was being consolidated). The 5 pm
 *         drop never applies to them;
 *       - group released: EVERY member shows the real status of the group's
 *         LEAST-ADVANCED member (cbGroupLeastSql), never below the group's own
 *         floor (cbGroupFloorSql) — the group moves through the stages together
 *         and never backwards. `group` on the answer; `cb` stays true, so no
 *         shipment number, date or customs detail shows.
 *     An office notice (Delayed / On hold) still shows on top. Without group
 *     facts (groupReleased undefined) the older steps below apply unchanged.
 *  0. AN ISSUED INVOICE (Brent, 2026-10-18/19): a package on an issued invoice
 *     is in Trinidad and ready to dispatch, so until it is out for delivery
 *     the customer sees "Cleared – Ready to Deliver" — nothing earlier, ever.
 *     It beats Consolidated Billing's masking, the 5 pm drop and the real
 *     stage. Of the office's statuses only these still show: a stage label
 *     LATER than it (Out for Delivery / Delivered), and a notice (Delayed / On
 *     hold) set AT OR AFTER the invoice was issued — one set before is stale
 *     (`isPreIssueOverride`; the admin deletes those on issue). Out for
 *     Delivery (raw 4) and Delivered (raw 5) are shown as normal.
 *  1. A status the office set (customer-status-core.ts). A notice ("Delayed",
 *     "On hold — contact us") always wins. A stage label wins too, except on a
 *     package HELD by Consolidated Billing, which only ever gets a notice.
 *  2. CONSOLIDATED BILLING (Brent, 2026-10-13). An ACTIVE member of a group
 *     (not removed from it, never Buy For Me), read WITHOUT group facts:
 *       - group still collecting (open / closed, not sent)           → Consolidating
 *       - released, not yet left Miami (no shipment line, 5 pm drop
 *         not passed)                                              → Received in Miami
 *       - out for delivery / delivered (raw 4 / 5)                  → those
 *       - NOT held (released and its bill issued, released with nothing to
 *         bill, or left off the bill), at 3 and cleared             → Ready for delivery
 *       - everything else: manifested, the 5 pm drop, in the air, landed,
 *         clearing, cleared but still held, waiting for the rest of the
 *         group                                                    → Consolidating
 *     A member uses its own steps (`CB_STEP_LABELS`) and NEVER shows a
 *     shipment number, a transit or clearance date, an ETA, customs figures
 *     or a per-package invoice before the group's bill: `cb` on the answer
 *     tells the surface to hide them. Where it is and when it ships or lands
 *     is internal only (R13 / R13a).
 *  3. The 5 pm "In Transit to Piarco" drop (auto-transit-core.ts) — never for
 *     a Consolidated Billing member. Since 2026-10-26 it applies whether or not
 *     the package is on a shipment / Airdrop manifest yet (Brent: the 22 Oct
 *     "never In Transit while unmanifested" gate is removed for ordinary
 *     packages); the floor keeps it from ever going back to In Miami.
 *  4. The real stage, in the customer's words.
 *
 * NEVER BACKWARDS (Brent, 2026-10-20). `displayFloor` is the highest status the
 * customer has already been shown (SwiftboxAdmin swiftbox_package_display_status,
 * migration 083, written only through the admin's one guarded writer). Every
 * step above shows AT LEAST that: a package the 5 pm drop already showed In
 * Transit does not fall back to In Miami when its shipment is linked to an
 * Airdrop manifest, and a Consolidated Billing member that already read
 * "Consolidating" does not fall back to In Miami. The floor is a ladder rank
 * (package-status-core.ts in the admin): 0 In Miami, 1 In Transit, 2 Awaiting
 * Clearance, 3 Cleared (shown as Awaiting Clearance), 4 Ready to Deliver. It
 * never reaches Out for Delivery / Delivered — those come from the real stage.
 * Absent / null = no floor (the table may not exist yet): exactly the old rule.
 *
 * PRE-ALERTS (R4, Brent, 2026-10-23). A pre-alert with NO package checked in yet
 * is a state the customer may see, through `prealertFacingStatus`: "Not yet
 * received in Miami", or "Flagged — checking with warehouse" once the office's
 * missing-check-in flag is on it. Neither is a count nor a location; the only
 * place ever named is Miami.
 *
 * DISPLAY ONLY. Nothing here is written anywhere; the real status, customs,
 * invoices, delivery and the admin's own chips never read it.
 */
import { CUSTOMER_STAGE_LABELS, cleanNote, customerStageOf, customerStatusStage, customerStatusView, isCustomerStatusKey, isOverrideActive, type CustomerStage, type StoredOverride } from "./customer-status-core";
import { inTransitLabel, isAutoTransitDue } from "./auto-transit-core";

export const CB_CONSOLIDATING_LABEL = "Consolidating — will be delivered together with your other packages";
export const CB_READY_LABEL = "Ready for delivery";
/** A Consolidated Billing member checked in at the Miami warehouse and not yet shipped (R1). */
export const CB_RECEIVED_MIAMI_LABEL = "Received in Miami";

/** A pre-alert whose package has not been checked in at the Miami warehouse (R4). */
export const PREALERT_NOT_RECEIVED_LABEL = "Not yet received in Miami";
/** The same pre-alert once the office has flagged the missing check-in to the warehouse. */
export const PREALERT_FLAGGED_LABEL = "Flagged — checking with warehouse";

export type PrealertFacingStatus = { label: string; flagged: boolean };

/**
 * What the customer sees for a PRE-ALERT with no package yet (R4): never a
 * count, never a location beyond Miami. `flagged` = an active missing-check-in
 * flag (the admin's swiftbox_prealert_flags row with no cleared_at).
 */
export function prealertFacingStatus(i: { flagged?: boolean | null }): PrealertFacingStatus {
  const flagged = !!i.flagged;
  return { label: flagged ? PREALERT_FLAGGED_LABEL : PREALERT_NOT_RECEIVED_LABEL, flagged };
}

/** What a customer sees once the package's invoice is issued (the admin's own chip wording). */
export const CLEARED_READY_LABEL = "Cleared – Ready to Deliver";

/**
 * CANCELLED (Brent, 2026-10-28): the office cancelled the package (picked up in
 * Miami, never shipped). TERMINAL — it beats everything, including the
 * never-backwards floor. Derived from swiftbox_audit_log: the package's NEWEST
 * row among PACKAGE_CANCEL_ACTION / PACKAGE_CANCEL_UNDO_ACTION (entity
 * 'package', entity_id = pk_id) is a cancel. The admin writes those rows
 * (lib/package-cancel.ts); every surface only reads them.
 */
export const CANCELLED_FACING_LABEL = "Cancelled";
export const PACKAGE_CANCEL_ACTION = "package_cancelled";
export const PACKAGE_CANCEL_UNDO_ACTION = "package_cancel_undo";

/** TRUE when the package whose id is the SQL expression `idExpr` is cancelled. Literals only. */
export function packageCancelledByIdSql(idExpr: string): string {
  return `EXISTS (SELECT 1 FROM swiftbox_audit_log pcx
            WHERE pcx.entity_type = 'package' AND pcx.entity_id = ${idExpr}
              AND pcx.action = '${PACKAGE_CANCEL_ACTION}'
              AND pcx.id = (SELECT MAX(pcy.id) FROM swiftbox_audit_log pcy
                             WHERE pcy.entity_type = 'package' AND pcy.entity_id = ${idExpr}
                               AND pcy.action IN ('${PACKAGE_CANCEL_ACTION}', '${PACKAGE_CANCEL_UNDO_ACTION}')))`;
}

/** Same test for a package id COLUMN such as "p.pk_id" (cast to the audit log's VARCHAR so idx_entity is used). */
export function packageCancelledColumnSql(pkColumn: string): string {
  if (!/^([a-z][a-z0-9_]*\.)?[a-z_]+$/i.test(pkColumn)) throw new Error("Invalid SQL column");
  return packageCancelledByIdSql(`CAST(${pkColumn} AS CHAR)`);
}

/**
 * SQL: the issued_at of the ISSUED invoice the package `pkExpr` is on, as
 * 'YYYY-MM-DD HH:MM:SS' on the database clock; '' when issued with no time
 * stamped; NULL when it is on no issued invoice. swiftbox_invoice_packages.pk_id
 * is UNIQUE, so there is at most one. Every surface reads the fact with this.
 */
export function invoiceIssuedAtSql(pkExpr: string): string {
  return `(SELECT COALESCE(DATE_FORMAT(i_cf.issued_at, '%Y-%m-%d %H:%i:%s'), '') FROM swiftbox_invoice_packages ip_cf JOIN swiftbox_invoices i_cf ON i_cf.invoice_id = ip_cf.invoice_id WHERE ip_cf.pk_id = ${pkExpr} AND i_cf.lifecycle = 'issued' LIMIT 1)`;
}

/** A value read with invoiceIssuedAtSql → CustomerFacingInput.invoiceIssuedAt (NULL stays null = not issued). */
export function invoiceIssuedAtFromRow(v: unknown): string | null {
  return v == null ? null : String(v);
}

/**
 * Is this office status stale once the package's invoice is issued — i.e.
 * EARLIER in the flow than Cleared – Ready to Deliver? A stage label up to
 * Awaiting Clearance always is; Out for Delivery / Delivered never are. A
 * notice is stale unless it was set at or after the issue (both times known,
 * same database clock). Unknown key → stale.
 */
export function isPreIssueOverride(o: StoredOverride, issuedAt: string | null | undefined): boolean {
  if (!isCustomerStatusKey(o.key)) return true;
  const stage = customerStatusStage(o.key);
  if (stage != null) return stage <= 2;
  const set = o.setAt ? String(o.setAt) : "";
  const at = issuedAt ? String(issuedAt) : "";
  return !(set && at && set >= at);
}

/** A Consolidated Billing member's progress steps, 0–4 (the stepper / timeline). */
export const CB_STEP_LABELS: readonly string[] = [
  CB_RECEIVED_MIAMI_LABEL,
  "Consolidating",
  CB_READY_LABEL,
  CUSTOMER_STAGE_LABELS[3],
  CUSTOMER_STAGE_LABELS[4],
];

/**
 * A package's ACTIVE Consolidated Billing membership (removed_at IS NULL, not a
 * Buy For Me package), as the admin's claim read gives it.
 */
export type CbMembership = {
  shippingReleased?: boolean;
  /** open | closed | released */
  state: string;
  /** The group's bill: null = not built yet, 0 = released with nothing to bill, >0 = the bill. */
  billId: number | null;
  /** That bill's lifecycle ('draft' | 'issued'); null when there is no bill. */
  billLifecycle: string | null;
  /** Set when this member was left off its group's bill (R11). */
  offBillReason: string | null;
  /** The group stopped collecting (Send now, opt-out, a release) — read with CB_GROUP_RELEASED_SQL. */
  groupReleased?: boolean;
  /** The group's least-advanced member (CB_GROUP_CODE), read with cbGroupLeastSql. */
  groupLeast?: number | null;
  /** The group's never-backwards floor (ladder rank 0–4), read with cbGroupFloorSql. */
  groupFloor?: number | null;
};

/**
 * HELD from delivery: a member of an unreleased group (open / closed), or a
 * released member that goes out on its group's bill while that bill is not
 * issued yet. The admin's delivery pool and collections use this same
 * predicate (`isHeldFromDelivery` there delegates here). A member left off the
 * bill, or of a group with nothing to bill, flows on its own.
 */
export function isCbHeld(m: CbMembership | null | undefined): boolean {
  if (!m || m.shippingReleased) return false;
  if (m.state === "open" || m.state === "closed") return true;
  if (m.state !== "released" || m.offBillReason) return false;
  if (m.billId === 0) return false;
  return m.billId == null || m.billLifecycle !== "issued";
}

/**
 * GROUP STATUS (Brent, 2026-10-23). After Send now (or opt-out, or any release)
 * every member of a group shows the real status of its LEAST-ADVANCED member,
 * and the group's shown status only ever moves forward. Codes:
 */
export const CB_GROUP_CODE = { MIAMI: 0, TRANSIT: 1, CLEARANCE: 2, READY: 4, OUT_FOR_DELIVERY: 5, DELIVERED: 6 } as const;

/**
 * SQL: the least-advanced code (CB_GROUP_CODE) over the ACTIVE members of the
 * group of membership row `m` — archived members never count. Per member: no
 * shipment line (or raw 0/1) = In Miami; raw 2 = In Transit; on an ISSUED
 * invoice = Ready; raw 3 = Awaiting Clearance; raw 4 = Out for Delivery; raw 5 =
 * Delivered. A package's newest shipment line is the one that counts.
 */
export function cbGroupLeastSql(m: string): string {
  return `(SELECT MIN(CASE WHEN s_gl.ship_id IS NULL THEN 0 WHEN s_gl.ship_status >= 5 THEN 6 WHEN s_gl.ship_status = 4 THEN 5
      WHEN EXISTS (SELECT 1 FROM swiftbox_invoice_packages ip_gl JOIN swiftbox_invoices i_gl ON i_gl.invoice_id = ip_gl.invoice_id WHERE ip_gl.pk_id = m_gl.pk_id AND i_gl.lifecycle = 'issued') THEN 4
      WHEN s_gl.ship_status = 3 THEN 2 WHEN s_gl.ship_status = 2 THEN 1 ELSE 0 END)
    FROM swiftbox_cb_group_packages m_gl JOIN mod_packages p_gl ON p_gl.pk_id = m_gl.pk_id
    LEFT JOIN mod_shipment s_gl ON s_gl.ship_id = (SELECT MAX(s2_gl.ship_id) FROM mod_shipment s2_gl WHERE s2_gl.package_id = m_gl.pk_id)
   WHERE m_gl.group_id = ${m}.group_id AND m_gl.removed_at IS NULL AND NOT (p_gl.archived_at IS NOT NULL AND s_gl.ship_id IS NULL))`;
}

/**
 * The group's own never-backwards floor (a ladder rank 0–4, see the header): the
 * admin keeps it in DISPLAY_FLOOR_TABLE under pk_id = −group_id (a negative id is
 * never a package). NULL = nothing shown yet.
 */
export function cbGroupFloorSql(m: string): string {
  return `(SELECT f_gl.display_rank FROM swiftbox_package_display_status f_gl WHERE f_gl.pk_id = -${m}.group_id)`;
}

/** The group stopped collecting: Send now, opt-out, an office release, or released when the window closed. */
export const CB_GROUP_RELEASED_SQL = "(g.state = 'released' OR (g.close_reason IN ('customer','turned_off') AND g.state IN ('closed','released')))";

/** SQL for the membership facts of the member row `m` (swiftbox_cb_group_packages) — join `g` = groups, `b` = bills. */
export const CB_MEMBERSHIP_SELECT = `g.state AS cb_state, g.bill_id AS cb_bill_id, b.lifecycle AS cb_bill_lifecycle, m.off_bill_reason AS cb_off_bill_reason, (g.close_reason = 'customer' AND g.state IN ('closed','released')) AS cb_shipping_released, ${CB_GROUP_RELEASED_SQL} AS cb_group_released, ${cbGroupLeastSql("m")} AS cb_group_least, ${cbGroupFloorSql("m")} AS cb_group_floor`;

/** A row read with CB_MEMBERSHIP_SELECT → CbMembership. */
export function cbMembershipFromRow(r: { cb_state: string | null; cb_bill_id: number | string | null; cb_bill_lifecycle: string | null; cb_off_bill_reason: string | null; cb_shipping_released?: number | string | null; cb_group_released?: number | string | null; cb_group_least?: number | string | null; cb_group_floor?: number | string | null }): CbMembership | null {
  if (!r.cb_state) return null;
  return {
    state: String(r.cb_state),
    shippingReleased: !!Number(r.cb_shipping_released),
    billId: r.cb_bill_id == null ? null : Number(r.cb_bill_id),
    billLifecycle: r.cb_bill_lifecycle ?? null,
    offBillReason: r.cb_off_bill_reason ? String(r.cb_off_bill_reason) : null,
    groupReleased: !!Number(r.cb_group_released),
    groupLeast: r.cb_group_least == null || r.cb_group_least === "" ? null : Number(r.cb_group_least),
    groupFloor: displayFloorOfRow(r.cb_group_floor),
  };
}

/** A group's least-advanced code → the ladder rank its members show (Out for Delivery / Delivered stay codes 5 / 6). */
export function cbGroupRankOfCode(code: number): number {
  return code >= CB_GROUP_CODE.OUT_FOR_DELIVERY ? code : code === CB_GROUP_CODE.READY ? 4 : Math.max(0, Math.min(2, code));
}

/** The rank a released group shows: its least-advanced member, never below the group's floor. */
export function cbGroupShownRank(m: Pick<CbMembership, "groupLeast" | "groupFloor">): number | null {
  if (m.groupLeast == null || !Number.isFinite(m.groupLeast)) return null;
  const rank = cbGroupRankOfCode(m.groupLeast);
  return rank >= 5 ? rank : Math.max(rank, m.groupFloor ?? 0);
}

export type CustomerFacingInput = {
  /** Raw mod_shipment.ship_status; null = no shipment line. The admin's derived Cleared (6) is accepted. */
  shipStatus: number | string | null | undefined;
  /** The package's shipment has a swiftbox_shipment_clearance row. */
  cleared?: boolean;
  /** mod_packages.pk_type: 1 AIR, 2 SEA. */
  pkType?: number | string | null;
  /** The office's stored override (any — this decides whether it is current). */
  override?: StoredOverride | null;
  /** Active Consolidated Billing membership; null / absent = not a member. */
  cb?: CbMembership | null;
  /** Airdrop receive time + mode, for the 5 pm drop. */
  airdrop?: { receivedAt: string | null; mode: string | null } | null;
  /**
   * The package's ISSUED invoice, read with invoiceIssuedAtSql: its issued_at
   * ('' = issued, time unknown); null / absent = on no issued invoice.
   */
  invoiceIssuedAt?: string | null;
  /**
   * The highest ladder rank already shown to the customer (0–4, see the header);
   * null / absent = none. Read with displayFloorOfRow.
   */
  displayFloor?: number | null;
  /** The office cancelled the package (packageCancelledColumnSql). Terminal. */
  cancelled?: boolean;
  nowMs?: number;
};

/** The admin's customer-facing floor table (migration 083). Read only here. */
export const DISPLAY_FLOOR_TABLE = "swiftbox_package_display_status";

/** A display_rank read from DISPLAY_FLOOR_TABLE → CustomerFacingInput.displayFloor (junk → null). */
export function displayFloorOfRow(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? Math.min(n, 4) : null;
}

export type CustomerFacingView = {
  /** Position on the progress bar, 0–4: CUSTOMER_STAGE_LABELS, or CB_STEP_LABELS when `cb`. */
  stage: CustomerStage;
  label: string;
  /**
   * office = set by the office; consolidated = Consolidated Billing; auto = the
   * 5 pm drop; floor = already shown earlier (never goes backwards); real = the
   * real stage.
   */
  source: "office" | "consolidated" | "auto" | "floor" | "real";
  /** The label is an office notice (Delayed / On hold): show it highlighted, the bar stays at `stage`. */
  notice: boolean;
  /** The office's note under its status, if any. */
  note: string | null;
  /** A Consolidated Billing member: CB steps; never a shipment number, transit / clearance date, ETA or customs detail. */
  cb: boolean;
  /** The Consolidating step: nothing after Miami may show, not even a date. */
  consolidating: boolean;
  /**
   * On an issued invoice and not yet out for delivery: Cleared – Ready to
   * Deliver, on step 2. A stepper names that step CLEARED_READY_LABEL.
   */
  ready: boolean;
  /**
   * A released Consolidated Billing member showing its GROUP's status (the
   * least-advanced member's): the ordinary steps (CUSTOMER_STAGE_LABELS), still
   * with no shipment number, date or customs detail (`cb` stays true).
   */
  group?: boolean;
  /** The office cancelled the package: show CANCELLED_FACING_LABEL and no progress bar. */
  cancelled?: boolean;
};

/** The group is still collecting (open, or closed by its window but not sent / released). */
export function cbGroupCollecting(m: CbMembership): boolean {
  if (m.groupReleased !== undefined) return !m.groupReleased;
  return (m.state === "open" || m.state === "closed") && !m.shippingReleased;
}

/**
 * A CB member's step from its real facts (readers without group facts). A
 * member of a group still collecting is always Consolidating (2026-10-26).
 * Otherwise step 0 = not yet left Miami (no shipment line, or a line still at
 * raw 0 / 1) and the 5 pm drop not passed.
 */
function cbStep(m: CbMembership, s: number | null, cleared: boolean, auto: boolean): CustomerStage {
  if (s === 5) return 4;
  if (s === 4) return 3;
  if (cbGroupCollecting(m)) return 1;
  if ((s == null || s <= 1) && !auto) return 0;
  if (!isCbHeld(m) && s === 3 && cleared) return 2;
  return 1;
}

/** A stage label the office set, placed on a CB member's steps (In Transit / Awaiting Clearance sit on step 1). */
function cbStepOfStage(stage: CustomerStage): CustomerStage {
  return stage === 0 ? 0 : stage <= 2 ? 1 : stage;
}

export function customerFacingView(i: CustomerFacingInput): CustomerFacingView {
  // C. Cancelled by the office: terminal, before everything (no floor, no CB mask).
  if (i.cancelled) {
    return { stage: 0, label: CANCELLED_FACING_LABEL, source: "office", notice: false, note: null, cb: false, consolidating: false, ready: false, cancelled: true };
  }
  const floor = displayFloorOfRow(i.displayFloor) ?? 0;
  // The floor as a customer stage: In Miami 0, In Transit 1, Awaiting Clearance /
  // Cleared / Ready 2 (Ready = the issued-invoice step).
  const floorStage: CustomerStage = floor >= 2 ? 2 : (floor as CustomerStage);
  const raw = i.shipStatus == null || i.shipStatus === "" ? null : Number(i.shipStatus);
  const s = raw === 6 ? 3 : raw != null && Number.isInteger(raw) ? raw : null;
  const cleared = raw === 6 || (s === 3 && !!i.cleared);
  const real = customerStageOf(s);
  const auto = i.airdrop ? isAutoTransitDue(i.airdrop.receivedAt, i.airdrop.mode, i.nowMs ?? Date.now()) : false;
  const cb = i.cb ?? null;
  const cbRaw = cb ? cbStep(cb, s, cleared, auto) : null;
  // A member already shown "Consolidating" never falls back to In Miami.
  const step: CustomerStage | null = cbRaw === 0 && floorStage >= 1 ? 1 : cbRaw;
  const word = (stage: CustomerStage) => (stage === 1 ? inTransitLabel(i.pkType ?? 1) : CUSTOMER_STAGE_LABELS[stage]);

  // CB. Consolidated Billing group status (Brent, 2026-10-23) — before everything
  //     but the package's own Out for Delivery / Delivered.
  if (cb && cb.groupReleased !== undefined && s !== 4 && s !== 5) {
    const notice = (stage: CustomerStage, extra: Partial<CustomerFacingView>) => {
      const o = customerStatusView(i.override, real, true, false);
      return o?.kind === "notice"
        ? ({ cb: true, consolidating: false, ready: false, ...extra, stage, label: o.label, source: "office", notice: true, note: o.note } as CustomerFacingView)
        : null;
    };
    if (!cb.groupReleased) {
      // Until Send now / opt-out: "Consolidating" for every member, wherever it
      // is (2026-10-26). No location, no 5 pm drop.
      const consolidating = { cb: true, consolidating: true, ready: false, group: false };
      return notice(1, consolidating) ?? { ...consolidating, stage: 1, label: CB_CONSOLIDATING_LABEL, source: "consolidated", notice: false, note: null };
    }
    const rank = cbGroupShownRank(cb);
    if (rank != null) {
      // After Send now: the least-advanced member's real status, never backwards.
      const stage: CustomerStage = rank >= 6 ? 4 : rank === 5 ? 3 : rank >= 2 ? 2 : (rank as CustomerStage);
      const ready = rank === 4;
      const extra = { cb: true, consolidating: false, ready, group: true };
      return notice(stage, extra) ?? { ...extra, stage, label: ready ? CLEARED_READY_LABEL : word(stage), source: "consolidated", notice: false, note: null };
    }
  }

  // 0. An issued invoice (or a customer already shown Ready to Deliver):
  //    Cleared – Ready to Deliver until out for delivery.
  if ((i.invoiceIssuedAt != null || floor >= 4) && s !== 4 && s !== 5) {
    const ready = { cb: !!cb, consolidating: false, ready: true };
    const issuedAt = i.invoiceIssuedAt ?? "";
    const o = i.override && !isPreIssueOverride(i.override, issuedAt) ? i.override : null;
    const later = o ? customerStatusStage(o.key) : null;
    if (o && later != null && later > 2) {
      return { ...ready, ready: false, stage: later, label: word(later), source: "office", notice: false, note: cleanNote(o.note) };
    }
    if (o && later == null && isOverrideActive(o, 2)) {
      return { ...ready, stage: 2, label: customerStatusView(o, 2, false)?.label ?? CLEARED_READY_LABEL, source: "office", notice: true, note: cleanNote(o.note) };
    }
    return { ...ready, stage: 2, label: CLEARED_READY_LABEL, source: i.invoiceIssuedAt != null ? "real" : "floor", notice: false, note: null };
  }

  const base = { cb: !!cb, consolidating: step === 1, ready: false };

  const office = customerStatusView(i.override, real, isCbHeld(cb), false);
  if (office?.kind === "notice") {
    return { ...base, stage: step ?? (Math.max(real, floorStage) as CustomerStage), label: office.label, source: "office", notice: true, note: office.note };
  }
  if (office?.kind === "stage" && (cb || office.stage > floorStage)) {
    return { ...base, consolidating: false, stage: cb ? cbStepOfStage(office.stage) : office.stage, label: word(office.stage), source: "office", notice: false, note: office.note };
  }
  if (cb && step != null) {
    const label = step === 0 ? CB_RECEIVED_MIAMI_LABEL : step === 1 ? CB_CONSOLIDATING_LABEL : step === 2 ? CB_READY_LABEL : CUSTOMER_STAGE_LABELS[step];
    return { ...base, stage: step, label, source: step <= 2 ? "consolidated" : "real", notice: false, note: null };
  }
  if (auto && real < 1 && floorStage <= 1) {
    return { ...base, stage: 1, label: word(1), source: "auto", notice: false, note: null };
  }
  if (floorStage > real) {
    return { ...base, stage: floorStage, label: word(floorStage), source: "floor", notice: false, note: null };
  }
  return { ...base, stage: real, label: word(real), source: "real", notice: false, note: null };
}
