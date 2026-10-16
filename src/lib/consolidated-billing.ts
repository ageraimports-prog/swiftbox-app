import { invoiceHouseColumn } from "./house-accounts";
import "server-only";
import { query } from "@/lib/db";
import { swiftCodeFromAc } from "@/lib/consolidatedBilling";
import {
  utcDate,
  windowDay,
  ttDateLabel,
  ttDayNumber,
  packageSection,
  billTotals,
  type PackageSection,
  type BillTotals,
} from "@/lib/consolidatedBillingCore";
import { CB_MEMBERSHIP_SELECT, cbMembershipFromRow, isCbHeld, type CbMembership } from "@/lib/customer-facing-status-core";

/**
 * Consolidated Billing v2 — the customer's side. SwiftboxAdmin owns every rule
 * (CLAUDE.md there, R1–R13); this module only READS the admin's tables, and asks
 * the admin to change the setting. It never writes a Consolidated Billing table
 * and never writes an invoice.
 *
 *  - Turning the switch on/off → admin POST /api/consolidated-billing/customer-toggle
 *    (x-consolidation-key = CONSOLIDATION_HOOK_KEY). Turning it off releases what
 *    is ready (R6) in the admin, which also builds and emails the bill.
 *  - The bill PDF → admin GET /api/consolidated-billing/bill-pdf, same key.
 *  - The bill's weights (combined-weight freight, 2026-10-01) → admin GET
 *    /api/consolidated-billing/bill-weights, same key. The admin computes them.
 *
 * Until the admin's migration 038 runs, the tables are missing: every read here
 * then answers "nothing", so the rest of the app is unaffected.
 *
 * R13 (Brent, 2026-10-13): what a member SHOWS is customer-facing-status-core.ts
 * (code-identical with the admin and the website) — "Consolidating" from the
 * moment it leaves Miami until its group's bill is issued, then Ready for
 * delivery. This module only reads the membership facts it needs. A held
 * member's invoice, and every child of a bill not yet issued, is not shown.
 */

const G = "swiftbox_cb_groups";
const M = "swiftbox_cb_group_packages";
const B = "swiftbox_cb_bills";
const BI = "swiftbox_cb_bill_invoices";
/**
 * Buy For Me is completely separate (Brent, 27 Sep 2026): a package bought for
 * the customer is never shown as waiting for a group, even in the moment between
 * its link and the admin's next run taking it out of the group.
 */
const BFM_PKS = "SELECT pk_id FROM swiftbox_bfm_packages";

/**
 * Run a read that excludes Buy For Me packages (`notBfm` = an `AND … NOT IN`
 * clause on the given pk column). If the Buy For Me table itself is missing
 * there are no Buy For Me packages, so the read is retried WITHOUT the clause —
 * Consolidated Billing must never go blank just because Buy For Me's table is
 * absent.
 */
async function excludingBfm<T>(pkCol: string, run: (notBfm: string) => Promise<T>): Promise<T> {
  try {
    return await run(` AND ${pkCol} NOT IN (${BFM_PKS})`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/swiftbox_bfm_packages/i.test(msg) && /doesn't exist|no such table/i.test(msg)) return run("");
    throw e;
  }
}

/** A read that answers `fallback` when migration 038 has not run. */
async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/doesn't exist|Unknown column|no such table/i.test(msg)) return fallback;
    throw e;
  }
}

export type CbState = {
  settingOn: boolean;
  /** Every account may use it — business accounts included (2026-10-02). */
  eligible: boolean;
  swiftCode: string;
  /** The open group, for "Day X of 20 … by <date>". */
  open: { day: number; windowEnd: string } | null;
  /** A group whose window has closed and is waiting for its last package. */
  closedWaiting: boolean;
  /**
   * "Send my packages now" — the OPEN group with at least one package, for the
   * button. Null when there is nothing to send.
   */
  group: CbSendGroup | null;
  /** The customer already said "send them": "being prepared for delivery". */
  preparing: boolean;
  /** The newest issued bill with money still due — the in-app notice. */
  billReady: { billNo: string; dueTtd: number } | null;
};

/** One package in the open group, for "3 packages waiting: Shoes, …". */
export type CbSendPackage = { commodities: string; tracking: string; wr: string };

export type CbSendGroup = {
  groupId: number;
  packages: CbSendPackage[];
  /** Whole days left in the window, today included (0 once it is over). */
  daysLeft: number;
};

const BFM_EXCLUDE = "AND m.pk_id NOT IN (SELECT pk_id FROM swiftbox_bfm_packages)";

/** The open group's active members (Buy For Me never counts). */
async function openGroupPackages(groupId: number): Promise<CbSendPackage[]> {
  const run = (bfm: string) =>
    query<{ commodities: string | null; tracking: string | null; wr: string | null }>(
      `SELECT p.commodities, p.tracking, p.wr
         FROM ${M} m JOIN mod_packages p ON p.pk_id = m.pk_id
        WHERE m.group_id = :g AND m.removed_at IS NULL ${bfm}
        ORDER BY m.entered_at, m.pk_id`,
      { g: groupId }
    );
  const rows = await run(BFM_EXCLUDE).catch(() => run(""));
  return rows.map((r) => ({
    commodities: (r.commodities ?? "").trim(),
    tracking: (r.tracking ?? "").trim(),
    wr: (r.wr ?? "").trim(),
  }));
}

export async function getCbState(userId: number): Promise<CbState> {
  const u = (await query<{ consolidated_billing: number; ac: string }>(
    "SELECT consolidated_billing, ac FROM users WHERE id = :userId LIMIT 1",
    { userId }
  ))[0];
  const base = {
    settingOn: Number(u?.consolidated_billing ?? 0) === 1,
    eligible: !!u,
    swiftCode: swiftCodeFromAc(u?.ac),
  };
  const groups = await safe(
    () => query<{ group_id: number; state: string; first_miami_entry_at: string | null; window_ends_at: string | null; close_reason: string | null }>(
      `SELECT group_id, state, first_miami_entry_at, window_ends_at, close_reason FROM ${G}
        WHERE user_id = :userId AND state IN ('open','closed') ORDER BY group_id`,
      { userId }
    ),
    []
  );
  const now = new Date();
  const openRow = groups.find((g) => g.state === "open");
  const first = utcDate(openRow?.first_miami_entry_at ?? null);
  const ends = utcDate(openRow?.window_ends_at ?? null);
  // An open group whose window has passed is closed by the admin's next run;
  // show it as closed now rather than as "Day 20 of 20" for a morning.
  const openStillRunning = !!(first && ends && ttDayNumber(now) <= ttDayNumber(ends));
  const bills = await listCbBills(userId);
  const ready = bills.find((b) => b.totals.dueTtd > 0) ?? null;
  // The open group, even on the morning its window has just run out (the admin
  // closes it on its next run): the customer can still say "send them".
  const pkgs = openRow ? await openGroupPackages(Number(openRow.group_id)) : [];
  const group: CbSendGroup | null = openRow && pkgs.length > 0
    ? { groupId: Number(openRow.group_id), packages: pkgs, daysLeft: ends ? Math.max(0, ttDayNumber(ends) - ttDayNumber(now) + 1) : 0 }
    : null;
  return {
    ...base,
    open: openStillRunning ? { day: windowDay(first!, now), windowEnd: ttDateLabel(ends!) } : null,
    closedWaiting: groups.some((g) => g.state === "closed" && g.close_reason !== "customer") || (!!openRow && !openStillRunning),
    group,
    preparing: groups.some((g) => g.state === "closed" && g.close_reason === "customer"),
    billReady: ready ? { billNo: ready.billNo, dueTtd: ready.totals.dueTtd } : null,
  };
}

/**
 * Turn Consolidated Billing on/off — through the admin, so R6 runs in ONE place.
 * Throws with a customer-safe sentence when the admin refuses or can't be reached;
 * the switch then does not move.
 */
export async function setCbSetting(
  userId: number,
  on: boolean
): Promise<{ released: number; removed: number; enrolled: number }> {
  const key = process.env.CONSOLIDATION_HOOK_KEY ?? "";
  if (!key) throw new Error("Consolidated Billing can't be changed right now. Please WhatsApp or call us.");
  const base = (process.env.ADMIN_URL || "https://admin.swiftboxtt.com").replace(/\/+$/, "");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25_000);
  try {
    const res = await fetch(`${base}/api/consolidated-billing/customer-toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-consolidation-key": key },
      body: JSON.stringify({ userId, on }),
      signal: ctl.signal,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { released?: number; removed?: number; enrolled?: number; error?: string };
    if (!res.ok) {
      if (res.status === 400 && data.error) throw new Error(data.error);
      throw new Error("Couldn't change Consolidated Billing. Please try again.");
    }
    // enrolled: turning it ON pulled in packages already in Miami / on their way (admin, 2026-10-03).
    return { released: Number(data.released ?? 0), removed: Number(data.removed ?? 0), enrolled: Number(data.enrolled ?? 0) };
  } catch (e) {
    if (e instanceof Error && e.name !== "AbortError" && !/fetch failed/i.test(e.message)) throw e;
    throw new Error("Couldn't change Consolidated Billing. Please try again.");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * "Send my packages now" — through the admin, which closes the group exactly as
 * on day 21 (reason 'customer') and owns every rule. The switch is untouched.
 * `already` = the group had already stopped taking packages (a double tap, a
 * retry, or the window closed meanwhile) — a friendly no-op, not an error.
 * Throws a customer-safe sentence when the admin refuses or can't be reached.
 */
export async function releaseCbGroup(userId: number, groupId: number): Promise<{ already: boolean }> {
  const key = process.env.CONSOLIDATION_HOOK_KEY ?? "";
  if (!key) throw new Error("We couldn't send your packages right now. Please WhatsApp or call us.");
  const base = (process.env.ADMIN_URL || "https://admin.swiftboxtt.com").replace(/\/+$/, "");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 60_000);
  try {
    const res = await fetch(`${base}/api/consolidated-billing/customer-release`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-consolidation-key": key },
      body: JSON.stringify({ userId, groupId }),
      signal: ctl.signal,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as { already?: boolean; error?: string };
    if (!res.ok) {
      if (res.status === 404 && data.error) throw new Error(data.error);
      throw new Error("Couldn't send your packages. Please try again.");
    }
    return { already: !!data.already };
  } catch (e) {
    if (e instanceof Error && e.name !== "AbortError" && !/fetch failed/i.test(e.message)) throw e;
    throw new Error("Couldn't send your packages. Please try again.");
  } finally {
    clearTimeout(timer);
  }
}

export type CbPackageFacts = {
  /**
   * The package's ACTIVE membership (removed members and Buy For Me are never
   * here). customer-facing-status-core.ts turns it into what the customer sees:
   * "Consolidating" from the moment it leaves Miami until its group's bill is
   * issued, then Ready for delivery → Out for Delivery → Delivered.
   */
  membership: CbMembership;
  /** A member of the customer's OPEN group (Miami included) — where "Send my packages now" is offered. */
  inOpenGroup: boolean;
};

/** pk_id → its Consolidated Billing membership, for this customer's packages in any group. */
export async function cbPackageFacts(userId: number): Promise<Map<number, CbPackageFacts>> {
  const rows = await safe(
    () => excludingBfm("m.pk_id", (notBfm) => query<{ pk_id: number; cb_state: string | null; cb_bill_id: number | null; cb_bill_lifecycle: string | null; cb_off_bill_reason: string | null }>(
      `SELECT m.pk_id, ${CB_MEMBERSHIP_SELECT}
         FROM ${M} m
         JOIN ${G} g ON g.group_id = m.group_id
         LEFT JOIN ${B} b ON b.bill_id = g.bill_id
        WHERE m.user_id = :userId AND m.removed_at IS NULL${notBfm}`,
      { userId }
    )),
    []
  );
  const out = new Map<number, CbPackageFacts>();
  for (const r of rows) {
    const membership = cbMembershipFromRow(r);
    if (membership) out.set(Number(r.pk_id), { membership, inOpenGroup: membership.state === "open" });
  }
  return out;
}

/**
 * Invoice ids the Invoices LIST must not show on their own: every child of a
 * Consolidated Bill (the bill is shown instead) and every invoice whose
 * packages are all still held for their group (isCbHeld — not the customer's
 * to see until the group's bill is issued).
 */
export async function cbHiddenInvoiceIds(userId: number): Promise<Set<number>> {
  const onBill = await safe(
    () => query<{ invoice_id: number }>(
      `SELECT bi.invoice_id FROM ${BI} bi JOIN ${B} b ON b.bill_id = bi.bill_id WHERE b.user_id = :userId`,
      { userId }
    ),
    []
  );
  const rows = await safe(
    () => excludingBfm("m.pk_id", (notBfm) => query<{ invoice_id: number; cb_state: string | null; cb_bill_id: number | null; cb_bill_lifecycle: string | null; cb_off_bill_reason: string | null }>(
      `SELECT ip.invoice_id, ${CB_MEMBERSHIP_SELECT}
         FROM swiftbox_invoice_packages ip
         JOIN swiftbox_invoices i ON i.invoice_id = ip.invoice_id AND i.user_id = :userId
         LEFT JOIN ${M} m ON m.pk_id = ip.pk_id AND m.removed_at IS NULL${notBfm}
         LEFT JOIN ${G} g ON g.group_id = m.group_id
         LEFT JOIN ${B} b ON b.bill_id = g.bill_id`,
      { userId }
    )),
    []
  );
  const allHeld = new Map<number, boolean>();
  for (const r of rows) {
    const id = Number(r.invoice_id);
    allHeld.set(id, (allHeld.get(id) ?? true) && isCbHeld(cbMembershipFromRow(r)));
  }
  const held = [...allHeld].filter(([, h]) => h).map(([id]) => id);
  return new Set([...onBill.map((r) => Number(r.invoice_id)), ...held]);
}

type ChildRow = { house_account: number; invoice_id: number; invoice_no: string; total_ttd: string; amount_paid: string; ship_no: string | null; billing_mode: string | null };

async function children(billId: number): Promise<ChildRow[]> {
  return query<ChildRow>(
    `SELECT ${await invoiceHouseColumn("i")}, i.invoice_id, i.invoice_no, i.total_ttd, i.amount_paid, i.ship_no, i.billing_mode
       FROM ${BI} bi JOIN swiftbox_invoices i ON i.invoice_id = bi.invoice_id
      WHERE bi.bill_id = :b ORDER BY i.invoice_id`,
    { b: billId }
  );
}

async function linesFor(invoiceIds: number[]) {
  if (invoiceIds.length === 0) return new Map<number, { lineType: string; description: string; amountTtd: number; basis: string | null }[]>();
  const rows = await query<{ invoice_id: number; line_type: string; description: string; amount_ttd: string; basis: string | null }>(
    `SELECT invoice_id, line_type, description, amount_ttd, basis FROM swiftbox_invoice_lines
      WHERE invoice_id IN (${invoiceIds.map((n) => Number(n)).join(",")}) ORDER BY invoice_id, sort_order`
  );
  const out = new Map<number, { lineType: string; description: string; amountTtd: number; basis: string | null }[]>();
  for (const r of rows) {
    const k = Number(r.invoice_id);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push({ lineType: r.line_type, description: r.description, amountTtd: Number(r.amount_ttd), basis: r.basis });
  }
  return out;
}

/** One package on a bill, for the list card's headline ("Shoes + 4 more") and tracking line. */
export type CbBillListPackage = { wr: string; tracking: string; commodities: string };

export type CbBillSummary = { billNo: string; date: string; packages: CbBillListPackage[]; totals: BillTotals };

/** The packages each bill's invoices cover, reached only through the bill's own links. */
async function billPackages(billIds: number[]): Promise<Map<number, CbBillListPackage[]>> {
  const out = new Map<number, CbBillListPackage[]>();
  if (billIds.length === 0) return out;
  const rows = await query<{ bill_id: number; wr: string | null; tracking: string | null; commodities: string | null }>(
    `SELECT bi.bill_id, p.wr, p.tracking, p.commodities
       FROM ${BI} bi
       JOIN swiftbox_invoice_packages ip ON ip.invoice_id = bi.invoice_id
       JOIN mod_packages p ON p.pk_id = ip.pk_id
      WHERE bi.bill_id IN (${billIds.map((n) => Number(n)).join(",")})
      ORDER BY bi.bill_id, p.wr`
  );
  for (const r of rows) {
    const k = Number(r.bill_id);
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push({ wr: (r.wr ?? "").trim(), tracking: (r.tracking ?? "").trim(), commodities: (r.commodities ?? "").trim() });
  }
  return out;
}

/** The customer's ISSUED Consolidated Bills, newest first, with live totals. */
export async function listCbBills(userId: number): Promise<CbBillSummary[]> {
  const bills = await safe(
    () => query<{ bill_id: number; bill_no: string; issued_at: string | null; created_at: string | null }>(
      `SELECT bill_id, bill_no, issued_at, created_at FROM ${B}
        WHERE user_id = :userId AND lifecycle = 'issued' ORDER BY bill_id DESC`,
      { userId }
    ),
    []
  );
  const out: CbBillSummary[] = [];
  const pkgs = await billPackages(bills.map((b) => Number(b.bill_id)));
  for (const b of bills) {
    const kids = await children(Number(b.bill_id));
    const lines = await linesFor(kids.map((k) => Number(k.invoice_id)));
    out.push({
      billNo: b.bill_no,
      date: String(b.issued_at ?? b.created_at ?? ""),
      packages: pkgs.get(Number(b.bill_id)) ?? [],
      totals: billTotals(kids.map((k) => ({
        houseAccount: Number(k.house_account) === 1, totalTtd: Number(k.total_ttd), amountPaid: Number(k.amount_paid), lines: lines.get(Number(k.invoice_id)) ?? [],
      }))),
    });
  }
  return out;
}

export type CbBillPackage = {
  houseAccount?: boolean;
  invoiceNo: string;
  pkId: number | null;
  wr: string;
  tracking: string;
  contents: string;
  section: PackageSection;
};

export type CbBillDetail = { billNo: string; date: string; packages: CbBillPackage[]; totals: BillTotals };

/** One ISSUED bill of this customer's, computed live from its invoices. Null = not theirs / not issued. */
export async function getCbBill(userId: number, billNo: string): Promise<CbBillDetail | null> {
  if (!/^CB-\d{6,}$/.test(billNo)) return null;
  const b = (await safe(
    () => query<{ bill_id: number; bill_no: string; issued_at: string | null }>(
      `SELECT bill_id, bill_no, issued_at FROM ${B} WHERE bill_no = :no AND user_id = :userId AND lifecycle = 'issued' LIMIT 1`,
      { no: billNo, userId }
    ),
    []
  ))[0];
  if (!b) return null;
  const kids = await children(Number(b.bill_id));
  const ids = kids.map((k) => Number(k.invoice_id));
  const lines = await linesFor(ids);
  const pkgs = ids.length === 0 ? [] : await query<{
    invoice_id: number; pk_id: number; wr: string; tracking: string | null; commodities: string | null;
    ship_value: string | null; asycuda_description: string | null; goods_desc_override: string | null;
  }>(
    // The declared value the customer is BILLED on, never the original: a
    // customs upliftment's figure when there is one (admin migration 065,
    // swiftbox_customs_uplifts), plus the inspection "Uplift By". The customer
    // never sees an uplift, an original value or a percentage — only the final
    // value, which is what their duty, VAT and insurance were worked out on.
    // Same formula as the admin's billedInsuranceValueSql (lib/customs-uplift-sql.ts):
    // the Uplift By counts only on an invoice the 2026-10-14 rule reached (not
    // one issued or paid before it), so a bill the customer already holds never
    // shows a different figure.
    `SELECT ip.invoice_id, p.pk_id, p.wr, p.tracking, p.commodities,
            IF(s.ship_id IS NULL, NULL,
               COALESCE((SELECT cup.uplifted_value FROM swiftbox_customs_uplifts cup WHERE cup.ship_id = s.ship_id), s.ship_value)
               + IF(inv.invoice_id IS NULL OR (inv.lifecycle IN ('draft','held') AND inv.amount_paid = 0)
                    OR inv.created_at >= '2026-10-14 00:00:00', COALESCE(cl.uplift_by, 0), 0)) AS ship_value,
            cl.asycuda_description, cl.goods_desc_override
       FROM swiftbox_invoice_packages ip
       LEFT JOIN swiftbox_invoices inv ON inv.invoice_id = ip.invoice_id
       JOIN mod_packages p ON p.pk_id = ip.pk_id
       LEFT JOIN mod_shipment s ON s.package_id = p.pk_id
       LEFT JOIN customs_lines cl ON cl.ship_id = s.ship_id
      WHERE ip.invoice_id IN (${ids.join(",")})
      ORDER BY p.wr`
  );
  const packages: CbBillPackage[] = kids.map((k) => {
    const mine = pkgs.filter((p) => Number(p.invoice_id) === Number(k.invoice_id));
    return {
      houseAccount: Number(k.house_account) === 1,
      invoiceNo: k.invoice_no,
      pkId: mine[0] ? Number(mine[0].pk_id) : null,
      wr: mine.map((p) => p.wr).join(", "),
      tracking: mine.map((p) => (p.tracking ?? "").trim()).filter(Boolean).join(", "),
      contents: mine.map((p) => (p.commodities ?? "").trim()).filter(Boolean).join(", "),
      section: packageSection(
        lines.get(Number(k.invoice_id)) ?? [],
        mine.map((p) => ({
          description: (p.goods_desc_override ?? "").trim() || (p.commodities ?? "").trim() || (p.asycuda_description ?? "").trim() || "Goods",
          declaredValueUsd: Math.round(Number(p.ship_value ?? 0) * 100) / 100,
        }))
      ),
    };
  });
  return {
    billNo: b.bill_no,
    date: String(b.issued_at ?? ""),
    packages,
    totals: billTotals(kids.map((k) => ({
      houseAccount: Number(k.house_account) === 1, totalTtd: Number(k.total_ttd), amountPaid: Number(k.amount_paid), lines: lines.get(Number(k.invoice_id)) ?? [],
    }))),
  };
}

/** The bill PDF, from the admin (which renders every Swiftbox PDF). Null = not available. */
export async function fetchCbBillPdf(userId: number, billNo: string): Promise<ArrayBuffer | null> {
  const key = process.env.CONSOLIDATION_HOOK_KEY ?? "";
  if (!key) return null;
  const base = (process.env.ADMIN_URL || "https://admin.swiftboxtt.com").replace(/\/+$/, "");
  const url = `${base}/api/consolidated-billing/bill-pdf?billNo=${encodeURIComponent(billNo)}&userId=${Number(userId)}`;
  const res = await fetch(url, { headers: { "x-consolidation-key": key }, cache: "no-store" });
  if (!res.ok) return null;
  return res.arrayBuffer();
}

/**
 * Combined-weight freight (admin lib/cb-weight-core.ts): each package's exact
 * weight, the group's combined exact weight and billed weight (rounded up once),
 * the same packages billed separately, and what that saved. Computed by the admin
 * from the invoices' ACTUAL figures — never worked out here.
 */
export type CbBillWeights = {
  ready: boolean;
  /** False when some package joined at its rounded intake pound (no scale weight). */
  allExact?: boolean;
  /** kind: "exact" (scale), "rounded" (only the recorded whole pound), "missing". */
  packages: { pkId: number; wr: string; exactLb: number | null; wholeLb: number; kind?: "exact" | "rounded" | "missing" }[];
  exactTotalLb: number;
  billedLb: number;
  separateLb: number;
  savingLb: number;
  /** TOTAL saved — freight + fuel + insurance (2026-10-02). */
  savingUsd: number;
  savingTtd: number;
  /** The freight + fuel part of savingUsd. Absent from an admin older than 2026-10-02. */
  freightSavingUsd?: number;
  /**
   * Group insurance (2026-10-02): one premium on the combined declared value,
   * cover still per package. Null/absent → every package carries its own.
   */
  insurance?: {
    combinedValueUsd: number;
    chargedUsd: number;
    separateUsd: number;
    savingUsd: number;
    tvWrs: string[];
    coverCapUsd: number;
  } | null;
};

/** The bill's weights from the admin. Null = not available (the bill still shows). */
export async function fetchCbBillWeights(userId: number, billNo: string): Promise<CbBillWeights | null> {
  try {
    const key = process.env.CONSOLIDATION_HOOK_KEY ?? "";
    if (!key) return null;
    const base = (process.env.ADMIN_URL || "https://admin.swiftboxtt.com").replace(/\/+$/, "");
    const url = `${base}/api/consolidated-billing/bill-weights?billNo=${encodeURIComponent(billNo)}&userId=${Number(userId)}`;
    const res = await fetch(url, { headers: { "x-consolidation-key": key }, cache: "no-store" });
    if (!res.ok) return null;
    const w = (await res.json()) as CbBillWeights;
    return w && typeof w.billedLb === "number" && Array.isArray(w.packages) ? w : null;
  } catch {
    return null;
  }
}

/**
 * The Consolidated Bill an invoice is on, or null. `issued` = the bill has gone
 * to the customer; until then its children are not the customer's to see.
 */
export async function cbBillForInvoice(invoiceId: number): Promise<{ billNo: string; issued: boolean } | null> {
  const r = await safe(
    () => query<{ bill_no: string; lifecycle: string | null }>(
      `SELECT b.bill_no, b.lifecycle FROM ${BI} bi JOIN ${B} b ON b.bill_id = bi.bill_id WHERE bi.invoice_id = :id LIMIT 1`,
      { id: invoiceId }
    ),
    []
  );
  return r[0] ? { billNo: r[0].bill_no, issued: r[0].lifecycle === "issued" } : null;
}
