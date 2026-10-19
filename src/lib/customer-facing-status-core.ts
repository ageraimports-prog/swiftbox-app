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
 *     (not removed from it, never Buy For Me), in any group state:
 *       - not yet left Miami (no shipment line, 5 pm drop not passed) → In Miami
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
 *     a Consolidated Billing member.
 *  4. The real stage, in the customer's words.
 *
 * DISPLAY ONLY. Nothing here is written anywhere; the real status, customs,
 * invoices, delivery and the admin's own chips never read it.
 */
import { CUSTOMER_STAGE_LABELS, cleanNote, customerStageOf, customerStatusStage, customerStatusView, isCustomerStatusKey, isOverrideActive, type CustomerStage, type StoredOverride } from "./customer-status-core";
import { inTransitLabel, isAutoTransitDue } from "./auto-transit-core";

export const CB_CONSOLIDATING_LABEL = "Consolidating — will be delivered together with your other packages";
export const CB_READY_LABEL = "Ready for delivery";

/** What a customer sees once the package's invoice is issued (the admin's own chip wording). */
export const CLEARED_READY_LABEL = "Cleared – Ready to Deliver";

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
  CUSTOMER_STAGE_LABELS[0],
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
  /** open | closed | released */
  state: string;
  /** The group's bill: null = not built yet, 0 = released with nothing to bill, >0 = the bill. */
  billId: number | null;
  /** That bill's lifecycle ('draft' | 'issued'); null when there is no bill. */
  billLifecycle: string | null;
  /** Set when this member was left off its group's bill (R11). */
  offBillReason: string | null;
};

/**
 * HELD from delivery: a member of an unreleased group (open / closed), or a
 * released member that goes out on its group's bill while that bill is not
 * issued yet. The admin's delivery pool and collections use this same
 * predicate (`isHeldFromDelivery` there delegates here). A member left off the
 * bill, or of a group with nothing to bill, flows on its own.
 */
export function isCbHeld(m: CbMembership | null | undefined): boolean {
  if (!m) return false;
  if (m.state === "open" || m.state === "closed") return true;
  if (m.state !== "released" || m.offBillReason) return false;
  if (m.billId === 0) return false;
  return m.billId == null || m.billLifecycle !== "issued";
}

/** SQL for the membership facts of the member row `m` (swiftbox_cb_group_packages) — join `g` = groups, `b` = bills. */
export const CB_MEMBERSHIP_SELECT = "g.state AS cb_state, g.bill_id AS cb_bill_id, b.lifecycle AS cb_bill_lifecycle, m.off_bill_reason AS cb_off_bill_reason";

/** A row read with CB_MEMBERSHIP_SELECT → CbMembership. */
export function cbMembershipFromRow(r: { cb_state: string | null; cb_bill_id: number | string | null; cb_bill_lifecycle: string | null; cb_off_bill_reason: string | null }): CbMembership | null {
  if (!r.cb_state) return null;
  return {
    state: String(r.cb_state),
    billId: r.cb_bill_id == null ? null : Number(r.cb_bill_id),
    billLifecycle: r.cb_bill_lifecycle ?? null,
    offBillReason: r.cb_off_bill_reason ? String(r.cb_off_bill_reason) : null,
  };
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
  nowMs?: number;
};

export type CustomerFacingView = {
  /** Position on the progress bar, 0–4: CUSTOMER_STAGE_LABELS, or CB_STEP_LABELS when `cb`. */
  stage: CustomerStage;
  label: string;
  /** office = set by the office; consolidated = Consolidated Billing; auto = the 5 pm drop; real = the real stage. */
  source: "office" | "consolidated" | "auto" | "real";
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
};

/** A CB member's step from its real facts. */
function cbStep(m: CbMembership, s: number | null, cleared: boolean, auto: boolean): CustomerStage {
  if (s === 5) return 4;
  if (s === 4) return 3;
  if (s == null && !auto) return 0;
  if (!isCbHeld(m) && s === 3 && cleared) return 2;
  return 1;
}

/** A stage label the office set, placed on a CB member's steps (In Transit / Awaiting Clearance sit on step 1). */
function cbStepOfStage(stage: CustomerStage): CustomerStage {
  return stage === 0 ? 0 : stage <= 2 ? 1 : stage;
}

export function customerFacingView(i: CustomerFacingInput): CustomerFacingView {
  const raw = i.shipStatus == null || i.shipStatus === "" ? null : Number(i.shipStatus);
  const s = raw === 6 ? 3 : raw != null && Number.isInteger(raw) ? raw : null;
  const cleared = raw === 6 || (s === 3 && !!i.cleared);
  const real = customerStageOf(s);
  const auto = i.airdrop ? isAutoTransitDue(i.airdrop.receivedAt, i.airdrop.mode, i.nowMs ?? Date.now()) : false;
  const cb = i.cb ?? null;
  const step = cb ? cbStep(cb, s, cleared, auto) : null;
  const word = (stage: CustomerStage) => (stage === 1 ? inTransitLabel(i.pkType ?? 1) : CUSTOMER_STAGE_LABELS[stage]);

  // 0. An issued invoice: Cleared – Ready to Deliver until out for delivery.
  if (i.invoiceIssuedAt != null && s !== 4 && s !== 5) {
    const ready = { cb: !!cb, consolidating: false, ready: true };
    const o = i.override && !isPreIssueOverride(i.override, i.invoiceIssuedAt) ? i.override : null;
    const later = o ? customerStatusStage(o.key) : null;
    if (o && later != null && later > 2) {
      return { ...ready, ready: false, stage: later, label: word(later), source: "office", notice: false, note: cleanNote(o.note) };
    }
    if (o && later == null && isOverrideActive(o, 2)) {
      return { ...ready, stage: 2, label: customerStatusView(o, 2, false)?.label ?? CLEARED_READY_LABEL, source: "office", notice: true, note: cleanNote(o.note) };
    }
    return { ...ready, stage: 2, label: CLEARED_READY_LABEL, source: "real", notice: false, note: null };
  }

  const base = { cb: !!cb, consolidating: step === 1, ready: false };

  const office = customerStatusView(i.override, real, isCbHeld(cb), false);
  if (office?.kind === "notice") {
    return { ...base, stage: step ?? real, label: office.label, source: "office", notice: true, note: office.note };
  }
  if (office?.kind === "stage") {
    return { ...base, consolidating: false, stage: cb ? cbStepOfStage(office.stage) : office.stage, label: word(office.stage), source: "office", notice: false, note: office.note };
  }
  if (cb && step != null) {
    const label = step === 1 ? CB_CONSOLIDATING_LABEL : step === 2 ? CB_READY_LABEL : CUSTOMER_STAGE_LABELS[step];
    return { ...base, stage: step, label, source: step === 1 || step === 2 ? "consolidated" : "real", notice: false, note: null };
  }
  if (auto && real < 1) {
    return { ...base, stage: 1, label: word(1), source: "auto", notice: false, note: null };
  }
  return { ...base, stage: real, label: word(real), source: "real", notice: false, note: null };
}
