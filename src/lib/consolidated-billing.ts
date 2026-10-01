import "server-only";
import { query } from "@/lib/db";
import { swiftCodeFromAc } from "@/lib/consolidatedBilling";
import {
  utcDate,
  windowDay,
  ttDateLabel,
  ttDayNumber,
  groupDisplay,
  packageSection,
  billTotals,
  type PackageSection,
  type BillTotals,
} from "@/lib/consolidatedBillingCore";

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
 *
 * Until the admin's migration 038 runs, the tables are missing: every read here
 * then answers "nothing", so the rest of the app is unaffected.
 *
 * R13: a member of an unreleased group reads "waiting for your group" from the
 * moment it leaves Miami — switching at landing would itself tell the customer
 * it had arrived in Trinidad. Its invoice is not shown until the group releases.
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
  eligible: boolean;
  ineligibleReason: string | null;
  swiftCode: string;
  /** The open group, for "Day X of 20 … by <date>". */
  open: { day: number; windowEnd: string } | null;
  /** A group whose window has closed and is waiting for its last package. */
  closedWaiting: boolean;
  /** The newest issued bill with money still due — the in-app notice. */
  billReady: { billNo: string; dueTtd: number } | null;
};

function ineligibleReasonOf(rateTier: string, autoHold: boolean): string | null {
  if (rateTier === "business") return "Business accounts are billed on terms, so Consolidated Billing isn't available.";
  if (autoHold) return "Your account is billed on terms, so Consolidated Billing isn't available.";
  return null;
}

export async function getCbState(userId: number): Promise<CbState> {
  const u = (await query<{ consolidated_billing: number; rate_tier: string; auto_hold: number; ac: string }>(
    "SELECT consolidated_billing, rate_tier, auto_hold, ac FROM users WHERE id = :userId LIMIT 1",
    { userId }
  ))[0];
  const reason = u ? ineligibleReasonOf(u.rate_tier, Number(u.auto_hold) === 1) : null;
  const base = {
    settingOn: Number(u?.consolidated_billing ?? 0) === 1,
    eligible: !!u && reason === null,
    ineligibleReason: reason,
    swiftCode: swiftCodeFromAc(u?.ac),
  };
  const groups = await safe(
    () => query<{ group_id: number; state: string; first_miami_entry_at: string | null; window_ends_at: string | null }>(
      `SELECT group_id, state, first_miami_entry_at, window_ends_at FROM ${G}
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
  return {
    ...base,
    open: openStillRunning ? { day: windowDay(first!, now), windowEnd: ttDateLabel(ends!) } : null,
    closedWaiting: groups.some((g) => g.state === "closed") || (!!openRow && !openStillRunning),
    billReady: ready ? { billNo: ready.billNo, dueTtd: ready.totals.dueTtd } : null,
  };
}

/**
 * Turn Consolidated Billing on/off — through the admin, so R6 runs in ONE place.
 * Throws with a customer-safe sentence when the admin refuses or can't be reached;
 * the switch then does not move.
 */
export async function setCbSetting(userId: number, on: boolean): Promise<{ released: number; removed: number }> {
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
    const data = (await res.json().catch(() => ({}))) as { released?: number; removed?: number; error?: string };
    if (!res.ok) {
      if (res.status === 400 && data.error) throw new Error(data.error);
      throw new Error("Couldn't change Consolidated Billing. Please try again.");
    }
    return { released: Number(data.released ?? 0), removed: Number(data.removed ?? 0) };
  } catch (e) {
    if (e instanceof Error && e.name !== "AbortError" && !/fetch failed/i.test(e.message)) throw e;
    throw new Error("Couldn't change Consolidated Billing. Please try again.");
  } finally {
    clearTimeout(timer);
  }
}

export type CbPackageDisplay = {
  /** Show CB_WAITING_LABEL instead of the stage (unreleased group, left Miami). */
  waiting: boolean;
  /** R7 — a released group's members show the last arrival's stage + date. */
  override: { shipStatus: number | null; awaitingDate: string | null } | null;
};

/** pk_id → how the package list / detail should show it. Only packages in a group appear. */
export async function cbPackageDisplay(userId: number): Promise<Map<number, CbPackageDisplay>> {
  const rows = await safe(
    () => excludingBfm("m.pk_id", (notBfm) => query<{ pk_id: number; group_id: number; state: string; ship_status: number | null; awaiting_date: string | null }>(
      `SELECT m.pk_id, g.group_id, g.state, s.ship_status, s.awaiting_date
         FROM ${M} m
         JOIN ${G} g ON g.group_id = m.group_id
         LEFT JOIN mod_shipment s ON s.package_id = m.pk_id
        WHERE m.user_id = :userId AND m.removed_at IS NULL${notBfm}`,
      { userId }
    )),
    []
  );
  const out = new Map<number, CbPackageDisplay>();
  const released = new Map<number, typeof rows>();
  for (const r of rows) {
    if (r.state === "released") {
      if (!released.has(r.group_id)) released.set(r.group_id, []);
      released.get(r.group_id)!.push(r);
    } else {
      out.set(Number(r.pk_id), { waiting: Number(r.ship_status ?? 0) >= 2, override: null });
    }
  }
  for (const members of released.values()) {
    const show = groupDisplay(members.map((m) => ({
      shipStatus: m.ship_status == null ? null : Number(m.ship_status),
      awaitingDate: m.awaiting_date,
    })));
    // Once everything is delivered each package shows its own record again.
    const override = show.shipStatus != null && show.shipStatus < 5 ? show : null;
    for (const m of members) out.set(Number(m.pk_id), { waiting: false, override });
  }
  return out;
}

/**
 * Invoice ids the Invoices screen must not list on their own: every child of a
 * Consolidated Bill (the bill is shown instead) and every invoice whose packages
 * are all still waiting for their group (not the customer's to see yet).
 */
export async function cbHiddenInvoiceIds(userId: number): Promise<Set<number>> {
  const onBill = await safe(
    () => query<{ invoice_id: number }>(
      `SELECT bi.invoice_id FROM ${BI} bi JOIN ${B} b ON b.bill_id = bi.bill_id WHERE b.user_id = :userId`,
      { userId }
    ),
    []
  );
  const held = await safe(
    () => excludingBfm("m.pk_id", (notBfm) => query<{ invoice_id: number }>(
      `SELECT ip.invoice_id
         FROM swiftbox_invoice_packages ip
         JOIN swiftbox_invoices i ON i.invoice_id = ip.invoice_id AND i.user_id = :userId
         LEFT JOIN ${M} m ON m.pk_id = ip.pk_id AND m.removed_at IS NULL${notBfm}
         LEFT JOIN ${G} g ON g.group_id = m.group_id AND g.state IN ('open','closed')
        GROUP BY ip.invoice_id
       HAVING COUNT(*) = SUM(g.group_id IS NOT NULL)`,
      { userId }
    )),
    []
  );
  return new Set([...onBill, ...held].map((r) => Number(r.invoice_id)));
}

type ChildRow = { invoice_id: number; invoice_no: string; total_ttd: string; amount_paid: string; ship_no: string | null; billing_mode: string | null };

async function children(billId: number): Promise<ChildRow[]> {
  return query<ChildRow>(
    `SELECT i.invoice_id, i.invoice_no, i.total_ttd, i.amount_paid, i.ship_no, i.billing_mode
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
        totalTtd: Number(k.total_ttd), amountPaid: Number(k.amount_paid), lines: lines.get(Number(k.invoice_id)) ?? [],
      }))),
    });
  }
  return out;
}

export type CbBillPackage = {
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
    `SELECT ip.invoice_id, p.pk_id, p.wr, p.tracking, p.commodities, s.ship_value, cl.asycuda_description, cl.goods_desc_override
       FROM swiftbox_invoice_packages ip
       JOIN mod_packages p ON p.pk_id = ip.pk_id
       LEFT JOIN mod_shipment s ON s.package_id = p.pk_id
       LEFT JOIN customs_lines cl ON cl.ship_id = s.ship_id
      WHERE ip.invoice_id IN (${ids.join(",")})
      ORDER BY p.wr`
  );
  const packages: CbBillPackage[] = kids.map((k) => {
    const mine = pkgs.filter((p) => Number(p.invoice_id) === Number(k.invoice_id));
    return {
      invoiceNo: k.invoice_no,
      pkId: mine[0] ? Number(mine[0].pk_id) : null,
      wr: mine.map((p) => p.wr).join(", "),
      tracking: mine.map((p) => (p.tracking ?? "").trim()).filter(Boolean).join(", "),
      contents: mine.map((p) => (p.commodities ?? "").trim()).filter(Boolean).join(", "),
      section: packageSection(
        lines.get(Number(k.invoice_id)) ?? [],
        mine.map((p) => ({
          description: (p.goods_desc_override ?? "").trim() || (p.commodities ?? "").trim() || (p.asycuda_description ?? "").trim() || "Goods",
          declaredValueUsd: Number(p.ship_value ?? 0),
        }))
      ),
    };
  });
  return {
    billNo: b.bill_no,
    date: String(b.issued_at ?? ""),
    packages,
    totals: billTotals(kids.map((k) => ({
      totalTtd: Number(k.total_ttd), amountPaid: Number(k.amount_paid), lines: lines.get(Number(k.invoice_id)) ?? [],
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

/** The Consolidated Bill an invoice is on, or null. */
export async function cbBillNoForInvoice(invoiceId: number): Promise<string | null> {
  const r = await safe(
    () => query<{ bill_no: string }>(
      `SELECT b.bill_no FROM ${BI} bi JOIN ${B} b ON b.bill_id = bi.bill_id WHERE bi.invoice_id = :id LIMIT 1`,
      { id: invoiceId }
    ),
    []
  );
  return r[0]?.bill_no ?? null;
}
