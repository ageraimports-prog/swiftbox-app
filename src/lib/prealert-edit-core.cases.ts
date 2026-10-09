/**
 * Pre-alert editing — the shared test cases for lib/prealert-edit-core.ts.
 *
 * TWIN FILE, code-identical in both repos: SwiftboxAdmin
 * lib/prealert-edit-core.cases.ts (run by `npx tsx scripts/test-prealert-edit.ts`)
 * and SwiftboxApp src/lib/prealert-edit-core.cases.ts (run by vitest in
 * prealert-edit-core.test.ts). Pure: node:assert only, no test framework.
 */
import assert from "node:assert/strict";
import {
  auditNoteFor,
  cancelAuditChanges,
  canonicalFromRow,
  customerAuditActor,
  customerCanEditTracking,
  customerRelinkLocked,
  CUSTOMER_CANCEL_ACTION,
  CUSTOMER_EDIT_ACTION,
  diffPrealert,
  editNotices,
  isCustomerLocked,
  linkChange,
  LOCKED_MESSAGE,
  OWNER_EDIT_ACTION,
  parseValueUsd,
  planCustomerCancel,
  planCustomerEdit,
  prealertAuditId,
  staleFieldLabels,
  TRACKING_LOCKED_MESSAGE,
  validatePrealertEdit,
  type LinkedPackage,
  type PrealertValues,
} from "./prealert-edit-core";

export const PREALERT_EDIT_CASES: Array<[string, () => void]> = [];
function t(name: string, fn: () => void) {
  PREALERT_EDIT_CASES.push([name, fn]);
}

const goodV2 = {
  tracking: "  1Z999AA10123456784 ",
  store: " Amazon ",
  description: "  phone   case\nand charger ",
  itemCount: "2",
  value: "49.5",
  freight: "air",
  notes: "  leave at door ",
  status: "pending",
};
const goodLegacy = {
  tracking: " 9400111899223 ",
  store: "Shein",
  category: " Clothing ",
  description: "dresses",
  value: "$1,250",
};

t("v2: a good edit validates to canonical values", () => {
  const r = validatePrealertEdit("v2", goodV2);
  assert.ok(r.ok);
  assert.deepEqual(r.values, {
    tracking: "1Z999AA10123456784",
    store: "Amazon",
    description: "PHONE CASE AND CHARGER",
    itemCount: "2",
    value: "49.50",
    freight: "AIR",
    notes: "leave at door",
    status: "pending",
  });
});

t("legacy: a good edit validates; $ and , tolerated; never carries v2-only keys", () => {
  const r = validatePrealertEdit("legacy", { ...goodLegacy, status: "processed", notes: "x", itemCount: "9" });
  assert.ok(r.ok);
  assert.deepEqual(r.values, {
    tracking: "9400111899223",
    store: "Shein",
    category: "Clothing",
    description: "DRESSES",
    value: "1250.00",
  });
});

t("required fields (same as the customer app's POST)", () => {
  const r = validatePrealertEdit("v2", { ...goodV2, tracking: "  ", store: "", description: " " , value: "" });
  assert.ok(!r.ok);
  assert.ok(r.errors.tracking && r.errors.store && r.errors.description && r.errors.value);
});

t("tracking: 100 for v2, 50 for legacy (varchar(50) would truncate silently)", () => {
  assert.ok(validatePrealertEdit("v2", { ...goodV2, tracking: "A".repeat(100) }).ok);
  assert.ok(!validatePrealertEdit("v2", { ...goodV2, tracking: "A".repeat(101) }).ok);
  assert.ok(validatePrealertEdit("legacy", { ...goodLegacy, tracking: "A".repeat(50) }).ok);
  const r = validatePrealertEdit("legacy", { ...goodLegacy, tracking: "A".repeat(51) });
  assert.ok(!r.ok && r.errors.tracking);
});

t("store ≤ 100, legacy category ≤ 50 and optional", () => {
  assert.ok(!validatePrealertEdit("v2", { ...goodV2, store: "S".repeat(101) }).ok);
  assert.ok(validatePrealertEdit("legacy", { ...goodLegacy, category: "" }).ok);
  assert.ok(!validatePrealertEdit("legacy", { ...goodLegacy, category: "C".repeat(51) }).ok);
});

t("items: whole number 1–255", () => {
  for (const ok of ["1", "255", " 7 "]) assert.ok(validatePrealertEdit("v2", { ...goodV2, itemCount: ok }).ok, ok);
  for (const bad of ["0", "256", "1.5", "-1", "", "abc", "2e1"])
    assert.ok(!validatePrealertEdit("v2", { ...goodV2, itemCount: bad }).ok, bad);
});

t("value: > 0, fixed 2 dp, v2 ≤ 99,999,999.99, legacy ≤ 9,999,999.99", () => {
  assert.equal(parseValueUsd("10"), "10.00");
  assert.equal(parseValueUsd("10.005"), "10.01");
  assert.equal(parseValueUsd(".5"), "0.50");
  assert.equal(parseValueUsd("$1,234.5"), "1234.50");
  for (const bad of ["0", "0.001", "-5", "abc", "1e5", "", "12.3.4"]) assert.equal(parseValueUsd(bad), null, bad);
  assert.ok(validatePrealertEdit("v2", { ...goodV2, value: "99999999.99" }).ok);
  assert.ok(!validatePrealertEdit("v2", { ...goodV2, value: "100000000" }).ok);
  assert.ok(validatePrealertEdit("legacy", { ...goodLegacy, value: "9999999.99" }).ok);
  const r = validatePrealertEdit("legacy", { ...goodLegacy, value: "10000000" });
  assert.ok(!r.ok && r.errors.value);
  // every legacy value that passes fits varchar(10)
  assert.ok("9999999.99".length <= 10);
});

t("freight AIR|SEA and status enum only (live MySQL stores '' for anything else)", () => {
  assert.ok(validatePrealertEdit("v2", { ...goodV2, freight: "sea" }).ok);
  assert.ok(!validatePrealertEdit("v2", { ...goodV2, freight: "OCEAN" }).ok);
  for (const s of ["pending", "received", "processed", "RECEIVED"])
    assert.ok(validatePrealertEdit("v2", { ...goodV2, status: s }).ok, s);
  for (const s of ["", "cancelled", "matched"]) assert.ok(!validatePrealertEdit("v2", { ...goodV2, status: s }).ok, s);
});

t("notes optional, ≤ 5000; description ≤ 5000", () => {
  assert.ok(validatePrealertEdit("v2", { ...goodV2, notes: "" }).ok);
  assert.ok(!validatePrealertEdit("v2", { ...goodV2, notes: "n".repeat(5001) }).ok);
  assert.ok(!validatePrealertEdit("v2", { ...goodV2, description: "d".repeat(5001) }).ok);
});

t("canonicalFromRow: DECIMAL → 2 dp, NULL notes → '', tracking trimmed", () => {
  const v2 = canonicalFromRow("v2", {
    tracking_number: " 1Z9 ", store_name: "Amazon", description: "PHONE", item_count: 2,
    invoice_value_usd: "49.5", freight_type: "AIR", notes: null, status: "pending",
  });
  assert.deepEqual(v2, {
    tracking: "1Z9", store: "Amazon", description: "PHONE", itemCount: "2",
    value: "49.50", freight: "AIR", notes: "", status: "pending",
  });
  const legacy = canonicalFromRow("legacy", {
    tracking_number: " 94001", merchant: "Shein", category: "Clothing", item_description: "dresses", value: "$50",
  });
  assert.deepEqual(legacy, { tracking: "94001", store: "Shein", category: "Clothing", description: "dresses", value: "$50" });
});

t("diff: untouched fields never change; case-only and $-normalising edits do", () => {
  const before = canonicalFromRow("legacy", {
    tracking_number: "94001", merchant: "Shein", category: "", item_description: "dresses", value: "$50",
  });
  const r = validatePrealertEdit("legacy", { tracking: "94001", store: "Shein", category: "", description: "dresses", value: "$50" });
  assert.ok(r.ok);
  const d = diffPrealert("legacy", before, r.values);
  assert.deepEqual(d.map((c) => [c.column, c.from, c.to]), [
    ["item_description", "dresses", "DRESSES"],
    ["value", "$50", "50.00"],
  ]);
  const same = validatePrealertEdit("v2", goodV2);
  assert.ok(same.ok);
  assert.deepEqual(diffPrealert("v2", same.values, same.values), []);
});

const pk = (pkId: number, wr: string, o: Partial<LinkedPackage> = {}): LinkedPackage => ({
  pkId, wr, shipNo: null, cleared: false, invoiced: false, ...o,
});

t("link change: gained / lost / kept", () => {
  const c = linkChange([pk(1, "WR1"), pk(2, "WR2")], [pk(2, "WR2"), pk(3, "WR3")]);
  assert.deepEqual(c.gained.map((p) => p.wr), ["WR3"]);
  assert.deepEqual(c.lost.map((p) => p.wr), ["WR1"]);
  assert.deepEqual(c.kept.map((p) => p.wr), ["WR2"]);
  assert.ok(c.changed);
  assert.ok(!linkChange([pk(1, "WR1")], [pk(1, "WR1")]).changed);
});

const trackingChange = [{ key: "tracking" as const, column: "tracking_number", label: "Tracking #", from: "A", to: "B" }];

t("notices: will now match / will unlink", () => {
  const ns = editNotices({ source: "v2", changes: trackingChange, link: linkChange([pk(1, "WR100")], [pk(2, "WR200")]), duplicateTracking: 0 });
  const text = ns.map((x) => x.text).join(" | ");
  assert.match(text, /Will now match WR200\./);
  assert.match(text, /Will unlink WR100\./);
});

t("notices: a tracking change that matches nothing says so", () => {
  const ns = editNotices({ source: "v2", changes: trackingChange, link: linkChange([], []), duplicateTracking: 0 });
  assert.match(ns[0].text, /No received package matches/);
});

t("notices: cleared / invoiced package → customs values already set (edit still allowed)", () => {
  const ns = editNotices({
    source: "v2",
    changes: [{ key: "value", column: "invoice_value_usd", label: "Value", from: "10.00", to: "20.00" }],
    link: linkChange([pk(1, "WR1", { cleared: true, shipNo: "S" })], [pk(1, "WR1", { cleared: true, shipNo: "S" })]),
    duplicateTracking: 0,
  });
  assert.equal(ns.length, 1);
  assert.equal(ns[0].tone, "warn");
  assert.match(ns[0].text, /WR1 is already cleared or invoiced — customs values are already set/);
  const unlinkInvoiced = editNotices({
    source: "v2", changes: trackingChange,
    link: linkChange([pk(1, "WR1", { invoiced: true })], []), duplicateTracking: 0,
  });
  assert.ok(unlinkInvoiced.some((x) => /customs values are already set/.test(x.text)));
  // open package → no customs notice
  const open = editNotices({
    source: "v2",
    changes: [{ key: "value", column: "invoice_value_usd", label: "Value", from: "10.00", to: "20.00" }],
    link: linkChange([pk(1, "WR1")], [pk(1, "WR1")]), duplicateTracking: 0,
  });
  assert.equal(open.length, 0);
});

t("notices: duplicate tracking on the same customer is flagged", () => {
  const ns = editNotices({ source: "v2", changes: trackingChange, link: linkChange([], []), duplicateTracking: 2 });
  assert.ok(ns.some((x) => /already has 2 other pre-alerts/.test(x.text)));
});

t("notices: legacy value on an unshipped package = the shipment seed", () => {
  const ns = editNotices({
    source: "legacy",
    changes: [{ key: "value", column: "value", label: "Value", from: "10.00", to: "20.00" }],
    link: linkChange([pk(1, "WR1")], [pk(1, "WR1")]), duplicateTracking: 0,
  });
  assert.ok(ns.some((x) => /starting declared value/.test(x.text)));
  const v2 = editNotices({
    source: "v2",
    changes: [{ key: "value", column: "invoice_value_usd", label: "Value", from: "10.00", to: "20.00" }],
    link: linkChange([pk(1, "WR1")], [pk(1, "WR1")]), duplicateTracking: 0,
  });
  assert.equal(v2.length, 0);
});

t("audit: id and note", () => {
  assert.equal(prealertAuditId("v2", 92), "v2:92");
  assert.equal(prealertAuditId("legacy", 5), "legacy:5");
  const link = linkChange([pk(1, "WR1")], [pk(2, "WR2")]);
  assert.equal(auditNoteFor(trackingChange[0], link), "field tracking_number; unlinked WR1; now matches WR2");
  assert.equal(
    auditNoteFor({ key: "store", column: "store_name", label: "Store", from: "a", to: "b" }, null),
    "field store_name"
  );
});

/* ─────────────────────────── the customer's own edit ─────────────────────────── */

const stored: PrealertValues = {
  tracking: "1Z999AA10123456784",
  store: "Amazon",
  description: "PHONE CASE",
  itemCount: "2",
  value: "49.50",
  freight: "AIR",
  notes: "office note",
  status: "received",
};
const custForm = { tracking: "1Z999AA10123456784", store: "Amazon", description: "phone case", itemCount: "2", value: "49.50", freight: "AIR" };

t("customer: audit vocabulary is distinct from the owner's and fits varchar(32)", () => {
  assert.notEqual(CUSTOMER_EDIT_ACTION, OWNER_EDIT_ACTION);
  for (const a of [OWNER_EDIT_ACTION, CUSTOMER_EDIT_ACTION, CUSTOMER_CANCEL_ACTION]) assert.ok(a.length <= 32, a);
  assert.equal(customerAuditActor(520), "customer:520");
});

t("customer: lock = a matched package cleared OR invoiced; unmatched never locked", () => {
  assert.equal(isCustomerLocked([]), false);
  assert.equal(isCustomerLocked([pk(1, "WR1")]), false);
  assert.equal(isCustomerLocked([pk(1, "WR1", { cleared: true })]), true);
  assert.equal(isCustomerLocked([pk(1, "WR1", { invoiced: true })]), true);
  assert.equal(isCustomerLocked([pk(1, "WR1"), pk(2, "WR2", { invoiced: true })]), true);
  assert.equal(customerRelinkLocked([pk(3, "WR3", { cleared: true })]), true);
});

t("customer: tracking editable only while nothing matches (a picked pre-alert always matches)", () => {
  assert.equal(customerCanEditTracking([]), true);
  assert.equal(customerCanEditTracking([pk(1, "WR1")]), false);
});

t("customer: an edit of the allowed fields — status and notes never change", () => {
  const r = planCustomerEdit({
    current: stored,
    links: [],
    fields: { ...custForm, store: " Shein ", itemCount: "3", value: "60", freight: "sea", description: "dress  and shoes", status: "processed", notes: "hacked" },
    expected: stored,
  });
  assert.ok(r.ok);
  assert.deepEqual(r.changes.map((c) => [c.key, c.to]), [
    ["store", "Shein"],
    ["description", "DRESS AND SHOES"],
    ["itemCount", "3"],
    ["value", "60.00"],
    ["freight", "SEA"],
  ]);
  assert.equal(r.values.status, "received");
  assert.equal(r.values.notes, "office note");
  assert.equal(r.trackingChanged, false);
});

t("customer: tracking change allowed on an unmatched pre-alert", () => {
  const r = planCustomerEdit({ current: stored, links: [], fields: { ...custForm, tracking: " 9400NEW " }, expected: stored });
  assert.ok(r.ok);
  assert.equal(r.trackingChanged, true);
  assert.equal(r.values.tracking, "9400NEW");
});

t("customer: tracking change REFUSED (422) once a package matches; same value is fine", () => {
  const r = planCustomerEdit({ current: stored, links: [pk(1, "WR1")], fields: { ...custForm, tracking: "OTHER" }, expected: stored });
  assert.ok(!r.ok && r.status === 422);
  assert.equal((r as { errors: Record<string, string> }).errors.tracking, TRACKING_LOCKED_MESSAGE);
  const same = planCustomerEdit({ current: stored, links: [pk(1, "WR1")], fields: { ...custForm, value: "10" }, expected: stored });
  assert.ok(same.ok && !same.trackingChanged);
  const omitted = planCustomerEdit({ current: stored, links: [pk(1, "WR1")], fields: { value: "10" }, expected: stored });
  assert.ok(omitted.ok && omitted.values.tracking === stored.tracking);
});

t("customer: locked (cleared / invoiced) → 409 with the WhatsApp message, before validation", () => {
  const r = planCustomerEdit({ current: stored, links: [pk(1, "WR1", { cleared: true })], fields: { value: "-1" }, expected: stored });
  assert.ok(!r.ok && r.status === 409);
  assert.equal(r.error, LOCKED_MESSAGE);
  assert.equal(LOCKED_MESSAGE, "This package has already cleared customs — message us on WhatsApp to change it.");
});

t("customer: stale form → 409 before anything else", () => {
  const r = planCustomerEdit({ current: stored, links: [pk(1, "WR1", { cleared: true })], fields: custForm, expected: { ...stored, value: "10.00" } });
  assert.ok(!r.ok && r.status === 409 && (r as { conflict?: boolean }).conflict);
  assert.deepEqual(staleFieldLabels("v2", stored, { value: "10.00" }), ["Invoice value (USD)"]);
  assert.deepEqual(staleFieldLabels("v2", stored, undefined), []);
});

t("customer: bad values → 422 with per-field errors, only on the customer's fields", () => {
  const r = planCustomerEdit({
    current: stored, links: [],
    fields: { tracking: "", store: "", description: " ", itemCount: "0", value: "abc", freight: "OCEAN" },
    expected: stored,
  });
  assert.ok(!r.ok && r.status === 422);
  const errors = (r as { errors: Record<string, string> }).errors;
  assert.deepEqual(Object.keys(errors).sort(), ["description", "freight", "itemCount", "store", "tracking", "value"]);
  assert.ok(!("status" in errors) && !("notes" in errors));
});

t("customer: cancel follows the same stale and lock rules", () => {
  assert.deepEqual(planCustomerCancel({ current: stored, links: [], expected: stored }), { ok: true });
  assert.deepEqual(planCustomerCancel({ current: stored, links: [pk(1, "WR1")], expected: stored }), { ok: true });
  const locked = planCustomerCancel({ current: stored, links: [pk(1, "WR1", { invoiced: true })], expected: stored });
  assert.ok(!locked.ok && locked.error === LOCKED_MESSAGE);
  const stale = planCustomerCancel({ current: stored, links: [], expected: { ...stored, store: "X" } });
  assert.ok(!stale.ok && stale.conflict);
});

t("customer: cancel audit lists every stored field old → blank", () => {
  const rows = cancelAuditChanges(stored);
  assert.equal(rows.length, 8);
  assert.ok(rows.every((r) => r.to === ""));
  assert.deepEqual(rows.find((r) => r.key === "value"), { key: "value", column: "invoice_value_usd", label: "Invoice value (USD)", from: "49.50", to: "" });
});
