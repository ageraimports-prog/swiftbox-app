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
import { CUSTOMER_STAGE_LABELS, customerStageOf, customerStatusView, type CustomerStage, type StoredOverride } from "./customer-status-core";
import { inTransitLabel, isAutoTransitDue } from "./auto-transit-core";

export const CB_CONSOLIDATING_LABEL = "Consolidating — will be delivered together with your other packages";
export const CB_READY_LABEL = "Ready for delivery";

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
  shippingReleased?: boolean;
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
  if (!m || m.shippingReleased) return false;
  if (m.state === "open" || m.state === "closed") return true;
  if (m.state !== "released" || m.offBillReason) return false;
  if (m.billId === 0) return false;
  return m.billId == null || m.billLifecycle !== "issued";
}

/** SQL for the membership facts of the member row `m` (swiftbox_cb_group_packages) — join `g` = groups, `b` = bills. */
export const CB_MEMBERSHIP_SELECT = "g.state AS cb_state, g.bill_id AS cb_bill_id, b.lifecycle AS cb_bill_lifecycle, m.off_bill_reason AS cb_off_bill_reason, (g.close_reason = 'customer' AND g.state IN ('closed','released')) AS cb_shipping_released";

/** A row read with CB_MEMBERSHIP_SELECT → CbMembership. */
export function cbMembershipFromRow(r: { cb_state: string | null; cb_bill_id: number | string | null; cb_bill_lifecycle: string | null; cb_off_bill_reason: string | null; cb_shipping_released?: number | string | null }): CbMembership | null {
  if (!r.cb_state) return null;
  return {
    state: String(r.cb_state),
    shippingReleased: !!Number(r.cb_shipping_released),
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
  const auto = s != null && i.airdrop ? isAutoTransitDue(i.airdrop.receivedAt, i.airdrop.mode, i.nowMs ?? Date.now()) : false;
  const cb = i.cb ?? null;
  const step = cb ? cbStep(cb, s, cleared, auto) : null;
  const word = (stage: CustomerStage) => (stage === 1 ? inTransitLabel(i.pkType ?? 1) : CUSTOMER_STAGE_LABELS[stage]);
  const base = { cb: !!cb, consolidating: step === 1 };

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
