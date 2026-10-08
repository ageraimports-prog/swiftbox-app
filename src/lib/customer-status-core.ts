/**
 * Customer-facing status override — the PURE rules (no imports, no I/O).
 *
 * THIS FILE IS CODE-IDENTICAL IN TWO REPOS: SwiftboxAdmin `lib/customer-status-core.ts`
 * and SwiftboxApp `src/lib/customer-status-core.ts`. Change both together.
 *
 * WHAT IT IS. The owner can choose what a customer SEES as a package's status in
 * the customer app — nothing else. It is display only. The package's real record
 * (`mod_shipment.ship_status`, its stage dates, customs, invoices, delivery runs,
 * referral credits, emails) never reads it and is never written by it. The one
 * table is `swiftbox_customer_status_overrides` (migration 055), one row per
 * package. The legacy PHP tracker, the website's /track and the WhatsApp bot's
 * /api/agent/packages do not read it and keep showing the real status.
 *
 * STAGES are the customer app's five, 0–4 (In Miami … Delivered), derived from
 * the RAW ship_status of the package's own shipment row — the same mapping as
 * SwiftboxApp `shipStatusToStage`, plus the admin's derived Cleared (6), which a
 * customer sees as Awaiting Clearance.
 *
 * THE MERGE RULE (Brent, 2026-10-06):
 *  - A STAGE label (In Transit … Delivered) shows while the real stage is BEHIND
 *    it. Once the real stage catches up or passes it, the override is over and
 *    the customer sees the real status — so the status a customer sees never
 *    goes backwards.
 *  - A NOTICE ("Delayed", "On hold — contact us") has no stage. It shows while
 *    the real stage has not moved forward from `base_stage`, the stage the
 *    package was at when the override was set. The progress bar stays at the
 *    real stage underneath it.
 *  - An override that is over is simply not shown (lazily, on read); the admin
 *    deletes the stale row when it next looks at the package. Nothing in the
 *    code that moves a package along knows this table exists.
 *
 * CONSOLIDATED BILLING. A package in an unreleased group (open / closed) only
 * ever gets a NOTICE: a stage label could tell the customer the package has
 * landed in Trinidad (R13). Enforced when it is set AND again on display.
 */

export const CUSTOMER_STATUS_TABLE = "swiftbox_customer_status_overrides";

export type CustomerStage = 0 | 1 | 2 | 3 | 4;

export const CUSTOMER_STAGE_LABELS: readonly string[] = [
  "In Miami",
  "In Transit",
  "Awaiting Clearance",
  "Out for Delivery",
  "Delivered",
];

export type CustomerStatusKey =
  | "in_transit"
  | "awaiting_clearance"
  | "out_for_delivery"
  | "delivered"
  | "delayed"
  | "on_hold";

type KeyDef = { key: CustomerStatusKey; label: string; stage: CustomerStage | null };

/**
 * Every value the override can hold, in picker order. Stored in the table as
 * the KEY, never the label, so wording can change without touching data.
 * There is no "In Miami": every package is at least there, so it could never
 * be ahead of the real stage.
 */
export const CUSTOMER_STATUS_OPTIONS: readonly KeyDef[] = [
  { key: "in_transit", label: "In Transit", stage: 1 },
  { key: "awaiting_clearance", label: "Awaiting Clearance", stage: 2 },
  { key: "out_for_delivery", label: "Out for Delivery", stage: 3 },
  { key: "delivered", label: "Delivered", stage: 4 },
  { key: "delayed", label: "Delayed", stage: null },
  { key: "on_hold", label: "On hold — contact us", stage: null },
];

export const NOTE_MAX = 255;

function defOf(key: string | null | undefined): KeyDef | null {
  return CUSTOMER_STATUS_OPTIONS.find((o) => o.key === key) ?? null;
}

export function isCustomerStatusKey(key: unknown): key is CustomerStatusKey {
  return typeof key === "string" && defOf(key) !== null;
}

/** "Delayed" etc. Unknown key → null. */
export function customerStatusLabel(key: string | null | undefined): string | null {
  return defOf(key)?.label ?? null;
}

/** The stage a stage label stands for; null for a notice or an unknown key. */
export function customerStatusStage(key: string | null | undefined): CustomerStage | null {
  return defOf(key)?.stage ?? null;
}

/**
 * Raw `mod_shipment.ship_status` (null = no shipment row) → customer stage.
 * 0/1/null → In Miami, 2 → In Transit, 3 → Awaiting Clearance, 4 → Out for
 * Delivery, 5 → Delivered. The admin's derived Cleared (6) is Awaiting
 * Clearance to a customer. Anything else → In Miami.
 */
export function customerStageOf(shipStatus: number | string | null | undefined): CustomerStage {
  if (shipStatus == null || shipStatus === "") return 0;
  const s = Number(shipStatus);
  if (s === 6) return 2;
  if (!Number.isInteger(s) || s < 1 || s > 5) return 0;
  return (s - 1) as CustomerStage;
}

export type StoredOverride = {
  key: string;
  note: string | null;
  baseStage: number;
};

/** Is this stored override still the thing the customer should see? */
export function isOverrideActive(o: StoredOverride | null | undefined, realStage: CustomerStage): boolean {
  if (!o) return false;
  const def = defOf(o.key);
  if (!def) return false; // unknown key: fall back to the real status
  if (def.stage != null) return realStage < def.stage;
  const base = Number(o.baseStage);
  if (!Number.isInteger(base) || base < 0 || base > 4) return false;
  return realStage <= base;
}

/** The labels the owner may pick for a package right now. */
export function allowedKeysFor(realStage: CustomerStage, grouped: boolean): CustomerStatusKey[] {
  if (realStage >= 4) return []; // delivered: nothing left to say
  return CUSTOMER_STATUS_OPTIONS.filter((o) =>
    o.stage == null ? true : !grouped && o.stage > realStage
  ).map((o) => o.key);
}

export type SetDecision = { ok: true; baseStage: CustomerStage } | { ok: false; reason: string };

/** May `key` be set on a package at `realStage`? The reason is shown to the owner. */
export function decideSet(key: string, realStage: CustomerStage, grouped: boolean): SetDecision {
  const def = defOf(key);
  if (!def) return { ok: false, reason: "Unknown status." };
  if (realStage >= 4) return { ok: false, reason: "Already delivered." };
  if (def.stage != null && grouped) {
    return { ok: false, reason: "In a Consolidated Billing group — only Delayed or On hold can be shown." };
  }
  if (def.stage != null && def.stage <= realStage) {
    return { ok: false, reason: `Already at ${CUSTOMER_STAGE_LABELS[realStage]} — the customer sees that already.` };
  }
  return { ok: true, baseStage: realStage };
}

/** Trim, collapse whitespace, drop control characters, cap at 255. Empty → null. */
export function cleanNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, NOTE_MAX) : null;
}

export type CustomerStatusView =
  | { kind: "stage"; stage: CustomerStage; label: string; note: string | null }
  | { kind: "notice"; key: CustomerStatusKey; label: string; note: string | null };

/**
 * What the customer app shows in place of the normal status, or null for the
 * normal status. `grouped` = an active member of an unreleased Consolidated
 * Billing group; a stage label is never shown for one, whenever it was set.
 *
 * `autoTransit` = the 5 pm drop rule (auto-transit-core.ts) says this package
 * has gone to the airport. Order: a current override the office set wins (a
 * notice such as "Delayed" holds the package back from the automatic In
 * Transit; a stage label is by definition ahead of the real stage). Otherwise
 * In Transit shows while the real stage is still In Miami — never for a
 * grouped package (R13). Once the real stage reaches In Transit the normal
 * status takes over, so it never goes backwards.
 */
export function customerStatusView(
  o: StoredOverride | null | undefined,
  realStage: CustomerStage,
  grouped: boolean,
  autoTransit = false
): CustomerStatusView | null {
  if (o && isOverrideActive(o, realStage)) {
    const def = defOf(o.key)!;
    const note = cleanNote(o.note);
    if (def.stage == null) return { kind: "notice", key: def.key, label: def.label, note };
    if (!grouped) return { kind: "stage", stage: def.stage, label: def.label, note };
  }
  if (autoTransit && !grouped && realStage < 1) {
    return { kind: "stage", stage: 1, label: CUSTOMER_STAGE_LABELS[1], note: null };
  }
  return null;
}
