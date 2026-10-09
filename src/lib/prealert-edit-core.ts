import { normalizePackageDescription } from "./package-description";

/**
 * Pre-alert editing — the PURE rules (no DB, no server-only import), so
 * scripts/test-prealert-edit.ts runs them under `npx tsx`. The DB half is
 * lib/prealert-edit.ts; the read-only list is lib/prealerts.ts.
 *
 * TWIN MODULE. SwiftboxApp carries a code-identical copy at
 * src/lib/prealert-edit-core.ts (the customer's own edit and cancel), with the
 * same tests in prealert-edit-core.cases.ts. Change both together — the
 * customer and the owner must validate a pre-alert by the same rules.
 *
 * Two source tables, one vocabulary. Each editable field has a stable `key`
 * used by the form, the validator, the diff and the audit log, and a `column`
 * per table:
 *
 *   key          v2 (swiftbox_prealerts)    legacy (mod_prealert)
 *   tracking     tracking_number  vc(100)   tracking_number   vc(50)
 *   store        store_name       vc(100)   merchant          vc(100)
 *   category     —                          category          vc(50)
 *   description  description      TEXT      item_description  TEXT
 *   itemCount    item_count       tinyint   —
 *   value        invoice_value_usd DEC(10,2) value            vc(10)
 *   freight      freight_type     enum      —
 *   notes        notes            TEXT NULL —
 *   status       status           enum      —   (legacy int status and receipt are never written)
 *
 * The limits are the customer app's POST /api/prealerts, TIGHTENED where a
 * legacy column is narrower: live MySQL is not in strict mode, so a value too
 * long for its column is silently TRUNCATED and an enum value outside its set is
 * stored as '' — the validator is the only thing standing between a typo and a
 * corrupted row. Legacy tracking is therefore capped at 50 and the legacy value
 * (varchar(10), stored as a fixed-2dp string) at 9,999,999.99.
 *
 * Every value here is a canonical STRING (item count "3", value "50.00", notes
 * "" for NULL) so before/after compare and audit identically on both tables.
 */

export type PrealertSource = "legacy" | "v2";
export const PREALERT_SOURCES: readonly PrealertSource[] = ["legacy", "v2"];

export const V2_STATUSES = ["pending", "received", "processed"] as const;
export type V2Status = (typeof V2_STATUSES)[number];
export const FREIGHT_TYPES = ["AIR", "SEA"] as const;

export type FieldKey =
  | "tracking"
  | "store"
  | "category"
  | "description"
  | "itemCount"
  | "value"
  | "freight"
  | "notes"
  | "status";

export type FieldDef = { key: FieldKey; column: string; label: string };

export const V2_FIELDS: readonly FieldDef[] = [
  { key: "tracking", column: "tracking_number", label: "Tracking #" },
  { key: "store", column: "store_name", label: "Store" },
  { key: "description", column: "description", label: "Description" },
  { key: "itemCount", column: "item_count", label: "Number of items" },
  { key: "value", column: "invoice_value_usd", label: "Invoice value (USD)" },
  { key: "freight", column: "freight_type", label: "Freight type" },
  { key: "notes", column: "notes", label: "Notes" },
  { key: "status", column: "status", label: "Status" },
];

export const LEGACY_FIELDS: readonly FieldDef[] = [
  { key: "tracking", column: "tracking_number", label: "Tracking #" },
  { key: "store", column: "merchant", label: "Merchant" },
  { key: "category", column: "category", label: "Category" },
  { key: "description", column: "item_description", label: "Item description" },
  { key: "value", column: "value", label: "Value (USD)" },
];

export function fieldsFor(source: PrealertSource): readonly FieldDef[] {
  return source === "v2" ? V2_FIELDS : LEGACY_FIELDS;
}

/** Canonical values keyed by field key — only the source's own keys are present. */
export type PrealertValues = Partial<Record<FieldKey, string>>;

export const LIMITS = {
  trackingV2: 100,
  trackingLegacy: 50,
  store: 100,
  category: 50,
  description: 5000,
  notes: 5000,
  itemsMin: 1,
  itemsMax: 255,
  valueMaxV2: 99999999.99,
  valueMaxLegacy: 9999999.99,
} as const;

export function isPrealertSource(v: unknown): v is PrealertSource {
  return v === "legacy" || v === "v2";
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

/**
 * "$1,234.5" → "1234.50"; anything that is not a positive amount → null.
 * Tolerates "$" and "," because legacy rows hold values typed that way.
 */
export function parseValueUsd(raw: unknown): string | null {
  const cleaned = str(raw).replace(/[$,\s]/g, "");
  if (!cleaned || !/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  const fixed = n.toFixed(2);
  return Number(fixed) > 0 ? fixed : null;
}

export type ValidationResult =
  | { ok: true; values: PrealertValues }
  | { ok: false; errors: Partial<Record<FieldKey, string>> };

/**
 * THE validator, shared by the admin edit route and (later) the customer edit.
 * Input is what a form posts, keyed by field key; output is canonical values.
 * Only the source's own fields are read — a stray `status` on a legacy edit is
 * ignored, never written.
 */
export function validatePrealertEdit(
  source: PrealertSource,
  input: Record<string, unknown>
): ValidationResult {
  const errors: Partial<Record<FieldKey, string>> = {};
  const values: PrealertValues = {};

  // Tracking — trimmed only (the link rule compares TRIM'd tracking).
  const tracking = str(input.tracking).trim();
  const trackingMax = source === "v2" ? LIMITS.trackingV2 : LIMITS.trackingLegacy;
  if (!tracking) errors.tracking = "Tracking number is required.";
  else if (tracking.length > trackingMax)
    errors.tracking = `Tracking number must be ${trackingMax} characters or fewer.`;
  values.tracking = tracking;

  const store = str(input.store).trim();
  if (!store) errors.store = source === "v2" ? "Store name is required." : "Merchant is required.";
  else if (store.length > LIMITS.store)
    errors.store = `${source === "v2" ? "Store name" : "Merchant"} must be ${LIMITS.store} characters or fewer.`;
  values.store = store;

  // Descriptions are stored in capitals, like every other description.
  const description = normalizePackageDescription(str(input.description));
  if (!description) errors.description = "Description is required.";
  else if (description.length > LIMITS.description)
    errors.description = `Description must be ${LIMITS.description} characters or fewer.`;
  values.description = description;

  const valueMax = source === "v2" ? LIMITS.valueMaxV2 : LIMITS.valueMaxLegacy;
  const value = parseValueUsd(input.value);
  if (value === null) errors.value = "Value must be an amount greater than 0.";
  else if (Number(value) > valueMax)
    errors.value = `Value must be ${valueMax.toLocaleString("en-US", { minimumFractionDigits: 2 })} or less.`;
  values.value = value ?? str(input.value).trim();

  if (source === "legacy") {
    const category = str(input.category).trim();
    if (category.length > LIMITS.category)
      errors.category = `Category must be ${LIMITS.category} characters or fewer.`;
    values.category = category;
  } else {
    const itemsRaw = str(input.itemCount).trim();
    const items = Number(itemsRaw);
    if (!/^\d+$/.test(itemsRaw) || !Number.isInteger(items) || items < LIMITS.itemsMin || items > LIMITS.itemsMax)
      errors.itemCount = `Number of items must be a whole number from ${LIMITS.itemsMin} to ${LIMITS.itemsMax}.`;
    values.itemCount = /^\d+$/.test(itemsRaw) ? String(items) : itemsRaw;

    const freight = str(input.freight).trim().toUpperCase();
    if (!(FREIGHT_TYPES as readonly string[]).includes(freight))
      errors.freight = "Freight type must be AIR or SEA.";
    values.freight = freight;

    const notes = str(input.notes).trim();
    if (notes.length > LIMITS.notes) errors.notes = `Notes must be ${LIMITS.notes} characters or fewer.`;
    values.notes = notes;

    const status = str(input.status).trim().toLowerCase();
    if (!(V2_STATUSES as readonly string[]).includes(status))
      errors.status = "Status must be pending, received or processed.";
    values.status = status;
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}

/**
 * A stored row → canonical values, the same shape the validator produces, so a
 * field nobody touched never shows up as a change. Legacy values are kept as
 * stored (trimmed) — a "$50" becoming "50.00" IS a change and is logged as one.
 */
export function canonicalFromRow(source: PrealertSource, row: Record<string, unknown>): PrealertValues {
  const out: PrealertValues = {};
  for (const f of fieldsFor(source)) {
    const raw = row[f.column];
    if (f.key === "value" && source === "v2") out.value = raw == null ? "" : Number(raw).toFixed(2);
    else if (f.key === "itemCount") out.itemCount = raw == null ? "" : String(Number(raw));
    else if (f.key === "description" || f.key === "notes") out[f.key] = str(raw).trim();
    else out[f.key] = str(raw).trim();
  }
  return out;
}

export type FieldChange = { key: FieldKey; column: string; label: string; from: string; to: string };

/** Changed fields only, in form order. Byte comparison: a case-only edit counts. */
export function diffPrealert(
  source: PrealertSource,
  before: PrealertValues,
  after: PrealertValues
): FieldChange[] {
  const out: FieldChange[] = [];
  for (const f of fieldsFor(source)) {
    const from = before[f.key] ?? "";
    const to = after[f.key] ?? "";
    if (from !== to) out.push({ key: f.key, column: f.column, label: f.label, from, to });
  }
  return out;
}

/* ─────────────────────────── the package link ─────────────────────────── */

/**
 * A package a pre-alert links to (same customer, same TRIM'd tracking — the
 * lib/prealert-needs.ts rule). `customsSet` = its shipment is cleared OR it is
 * invoiced (any lifecycle): the declared value and the gauge are closed.
 */
export type LinkedPackage = {
  pkId: number;
  wr: string;
  shipNo: string | null;
  cleared: boolean;
  invoiced: boolean;
};

export function customsSet(p: LinkedPackage): boolean {
  return p.cleared || p.invoiced;
}

export type LinkChange = {
  changed: boolean;
  gained: LinkedPackage[];
  lost: LinkedPackage[];
  kept: LinkedPackage[];
};

export function linkChange(before: LinkedPackage[], after: LinkedPackage[]): LinkChange {
  const b = new Set(before.map((p) => p.pkId));
  const a = new Set(after.map((p) => p.pkId));
  const gained = after.filter((p) => !b.has(p.pkId));
  const lost = before.filter((p) => !a.has(p.pkId));
  const kept = after.filter((p) => b.has(p.pkId));
  return { changed: gained.length > 0 || lost.length > 0, gained, lost, kept };
}

function wrList(ps: LinkedPackage[]): string {
  return ps.map((p) => p.wr || `package #${p.pkId}`).join(", ");
}

/** What the owner reads before confirming: the link effect and any customs notice. */
export type EditNotice = { tone: "info" | "warn"; text: string };

export function editNotices(input: {
  source: PrealertSource;
  changes: FieldChange[];
  link: LinkChange;
  /** Other pre-alerts of this customer already carrying the NEW tracking. */
  duplicateTracking: number;
}): EditNotice[] {
  const { source, changes, link, duplicateTracking } = input;
  const out: EditNotice[] = [];
  const changedKeys = new Set(changes.map((c) => c.key));

  if (link.gained.length) out.push({ tone: "warn", text: `Will now match ${wrList(link.gained)}.` });
  if (link.lost.length) out.push({ tone: "warn", text: `Will unlink ${wrList(link.lost)}.` });
  if (changedKeys.has("tracking") && !link.changed) {
    out.push({
      tone: "info",
      text: link.kept.length
        ? `Still matches ${wrList(link.kept)}.`
        : "No received package matches this tracking number yet.",
    });
  }

  const touched = [...link.gained, ...link.lost, ...link.kept].filter(customsSet);
  if (touched.length && changes.length) {
    out.push({
      tone: "warn",
      text: `${wrList(touched)} ${touched.length === 1 ? "is" : "are"} already cleared or invoiced — customs values are already set. This edit changes the pre-alert only; the declared value, duty and invoice stay as they are.`,
    });
  }

  if (duplicateTracking > 0 && changedKeys.has("tracking")) {
    out.push({
      tone: "warn",
      text: `This customer already has ${duplicateTracking} other pre-alert${duplicateTracking === 1 ? "" : "s"} with this tracking number.`,
    });
  }

  // The legacy value is the shipment SEED (lib/shipments.ts): it becomes the
  // declared value when the package is put on a shipment.
  if (source === "legacy" && changedKeys.has("value")) {
    const notShipped = [...link.gained, ...link.kept].filter((p) => !p.shipNo);
    if (notShipped.length) {
      out.push({
        tone: "info",
        text: `${wrList(notShipped)} is not on a shipment yet — this value will be its starting declared value when it is added to one.`,
      });
    }
  }
  return out;
}

/** The audit "note" for one changed field (swiftbox_audit_log.note is varchar(255)). */
export function auditNoteFor(change: FieldChange, link: LinkChange | null): string {
  let note = `field ${change.column}`;
  if (change.key === "tracking" && link?.changed) {
    const parts: string[] = [];
    if (link.lost.length) parts.push(`unlinked ${wrList(link.lost)}`);
    if (link.gained.length) parts.push(`now matches ${wrList(link.gained)}`);
    note += `; ${parts.join("; ")}`;
  }
  return note.slice(0, 255);
}

/** Entity id for swiftbox_audit_log: "v2:92" / "legacy:5". */
export function prealertAuditId(source: PrealertSource, id: number): string {
  return `${source}:${id}`;
}

/* ───────────────────────────── audit vocabulary ───────────────────────────── */

/** swiftbox_audit_log.action for each kind of pre-alert change (varchar(32)). */
export const OWNER_EDIT_ACTION = "prealert_edit";
export const CUSTOMER_EDIT_ACTION = "customer_prealert_edit";
export const CUSTOMER_CANCEL_ACTION = "customer_prealert_cancel";

/** The audit `actor` for a customer: "customer:<users.id>". Owner rows carry the staff email. */
export function customerAuditActor(userId: number): string {
  return `customer:${Math.trunc(Number(userId))}`;
}

/* ─────────────────── stale form (both the owner and the customer) ─────────────────── */

/**
 * Labels of the fields whose stored value is no longer what the form loaded
 * (`expected`). Only keys present in `expected` are compared; an empty result
 * means the form is current. A non-empty one is a 409, never an overwrite.
 */
export function staleFieldLabels(
  source: PrealertSource,
  stored: PrealertValues,
  expected: PrealertValues | undefined
): string[] {
  if (!expected || typeof expected !== "object") return [];
  return fieldsFor(source)
    .filter((f) => expected[f.key] !== undefined && String(expected[f.key] ?? "") !== (stored[f.key] ?? ""))
    .map((f) => f.label);
}

export const STALE_MESSAGE =
  "This pre-alert was changed since you opened it. Reload to see the current details, then try again.";

/* ─────────────────────── the CUSTOMER's own edit / cancel ─────────────────────── */

/**
 * What a customer may change on their OWN app pre-alert (swiftbox_prealerts).
 * Never status or notes — those are the office's. Legacy pre-alerts are never
 * customer-editable.
 */
export const CUSTOMER_FIELD_KEYS: readonly FieldKey[] = ["tracking", "store", "description", "itemCount", "value", "freight"];

export const LOCKED_MESSAGE =
  "This package has already cleared customs — message us on WhatsApp to change it.";
export const TRACKING_LOCKED_MESSAGE =
  "The tracking number can't be changed once it matches a package.";

/**
 * LOCKED = a matched package is cleared or invoiced (customs values are set).
 * An unmatched pre-alert is never locked.
 */
export function isCustomerLocked(links: LinkedPackage[]): boolean {
  return links.some(customsSet);
}

/**
 * Tracking is editable only while NO package matches it. A picked pre-alert is
 * created from a package with that exact tracking, so it is always matched and
 * its tracking is always read-only; a manual one becomes read-only the moment a
 * package with its tracking arrives.
 */
export function customerCanEditTracking(links: LinkedPackage[]): boolean {
  return links.length === 0;
}

export type CustomerEditPlan =
  | { ok: true; values: PrealertValues; changes: FieldChange[]; trackingChanged: boolean }
  | { ok: false; status: 409; error: string; conflict?: true; locked?: true }
  | { ok: false; status: 422; error: string; errors: Partial<Record<FieldKey, string>> };

/**
 * Decide a customer's edit from the stored row, the packages it matches now,
 * and what the form sent. Order: stale form (409) → locked (409) → tracking
 * rule and validation (422). Only CUSTOMER_FIELD_KEYS are read from `fields`;
 * status and notes are carried over from the stored row and never change.
 * The server must still re-check the NEW tracking's packages with
 * `customerRelinkLocked` before writing.
 */
export function planCustomerEdit(input: {
  current: PrealertValues;
  links: LinkedPackage[];
  fields: Record<string, unknown>;
  expected?: PrealertValues;
}): CustomerEditPlan {
  const { current, links } = input;
  const fields = input.fields && typeof input.fields === "object" ? input.fields : {};
  if (staleFieldLabels("v2", current, input.expected).length) {
    return { ok: false, status: 409, error: STALE_MESSAGE, conflict: true };
  }
  if (isCustomerLocked(links)) return { ok: false, status: 409, error: LOCKED_MESSAGE, locked: true };

  const merged: Record<string, unknown> = { ...current };
  for (const k of CUSTOMER_FIELD_KEYS) if (fields[k] !== undefined) merged[k] = fields[k];

  const sentTracking = fields.tracking === undefined ? undefined : String(fields.tracking ?? "").trim();
  if (!customerCanEditTracking(links) && sentTracking !== undefined && sentTracking !== (current.tracking ?? "")) {
    return {
      ok: false,
      status: 422,
      error: "Please fix the highlighted fields.",
      errors: { tracking: TRACKING_LOCKED_MESSAGE },
    };
  }
  if (!customerCanEditTracking(links)) merged.tracking = current.tracking ?? "";

  const v = validatePrealertEdit("v2", merged);
  if (!v.ok) {
    const errors: Partial<Record<FieldKey, string>> = {};
    for (const k of CUSTOMER_FIELD_KEYS) if (v.errors[k]) errors[k] = v.errors[k];
    // status/notes come from the stored row; if THEY fail, the row is the
    // office's problem, not the customer's — refuse without blaming a field.
    if (!Object.keys(errors).length) {
      return { ok: false, status: 409, error: "This pre-alert can't be changed here — message us on WhatsApp." };
    }
    return { ok: false, status: 422, error: "Please fix the highlighted fields.", errors };
  }
  const changes = diffPrealert("v2", current, v.values).filter((c) => CUSTOMER_FIELD_KEYS.includes(c.key));
  return {
    ok: true,
    values: v.values,
    changes,
    trackingChanged: (current.tracking ?? "") !== (v.values.tracking ?? ""),
  };
}

/** A new tracking that would match a cleared/invoiced package is refused like a locked one. */
export function customerRelinkLocked(linksAfter: LinkedPackage[]): boolean {
  return isCustomerLocked(linksAfter);
}

export type CustomerCancelPlan = { ok: true } | { ok: false; status: 409; error: string; conflict?: true; locked?: true };

/** Cancel = delete the pre-alert. Same stale and lock rules as an edit. */
export function planCustomerCancel(input: {
  current: PrealertValues;
  links: LinkedPackage[];
  expected?: PrealertValues;
}): CustomerCancelPlan {
  if (staleFieldLabels("v2", input.current, input.expected).length) {
    return { ok: false, status: 409, error: STALE_MESSAGE, conflict: true };
  }
  if (isCustomerLocked(input.links)) return { ok: false, status: 409, error: LOCKED_MESSAGE, locked: true };
  return { ok: true };
}

/** Audit rows for a cancel: every stored field, old → (nothing). */
export function cancelAuditChanges(current: PrealertValues): FieldChange[] {
  return fieldsFor("v2")
    .filter((f) => (current[f.key] ?? "") !== "")
    .map((f) => ({ key: f.key, column: f.column, label: f.label, from: current[f.key] ?? "", to: "" }));
}
