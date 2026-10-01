import "server-only";
import { get, put, del } from "@vercel/blob";
import { execute, query } from "@/lib/db";
import { getTransport } from "@/lib/email";
import type { SessionUser } from "@/lib/session";
import {
  BFM_EVENT_DEFS,
  BFM_STATUS_LABEL,
  MAX_ITEMS_PER_REQUEST,
  MAX_QTY,
  REFUND_METHOD_LABEL,
  centsToDecimal,
  cleanText,
  decimalToCents,
  decimalToCentsOrNull,
  isBfmStatus,
  isRefundMethod,
  parseMoneyInput,
  paymentRef,
  requestNo,
  safeProductUrl,
  swiftCode,
  type BfmStatus,
  type QuoteFigures,
} from "@/lib/buy-for-me-core";
import { detectSlipType, randomSlipName, slipPath, SLIP_MAX_BYTES } from "@/lib/slip-file";

/**
 * Buy For Me — the customer side (SwiftboxAdmin BUY_FOR_ME_PLAN.md, Block D).
 *
 * The admin owns the rules. This app does four things only, all scoped to the
 * logged-in customer (`WHERE user_id = :userId` is the ownership check):
 *   1. creates a request (status 'submitted');
 *   2. reads its own requests and shows the STORED quote figures (it never
 *      recalculates — lib/buy-for-me-core.ts is an identical copy of the admin's,
 *      used here only for labels, text cleaning and parsing);
 *   3. uploads a payment slip (quoted → payment_uploaded) into the PRIVATE blob
 *      store — the blob URL never leaves the server;
 *   4. cancels, only while nothing has been paid.
 * Every status write is conditional on the status it was decided from.
 */

const STAFF_ALERT_TO = () => (process.env.BFM_STAFF_ALERT_TO || "info@swiftboxtt.com").trim();
const ADMIN_URL = "https://admin.swiftboxtt.com";
const MAX_OPEN_REQUESTS = 10;

export type BfmSummary = { id: number; no: string; status: BfmStatus; statusLabel: string; itemCount: number; totalTtdCents: number | null; createdAt: string | null; hasUpdate: boolean };

function actorFor(s: SessionUser): string {
  return `customer:${swiftCode(s.ac)}`;
}

async function audit(requestId: number, action: string, s: SessionUser, from: string | null, to: string | null, note?: string | null) {
  try {
    await execute(
      `INSERT INTO swiftbox_audit_log (entity_type, entity_id, action, from_value, to_value, actor, logged_at, note)
       VALUES ('buyforme', :id, :action, :from, :to, :actor, NOW(), :note)`,
      { id: String(requestId), action, from, to, actor: actorFor(s), note: note ? cleanText(note, 255) : null }
    );
  } catch (e) {
    console.error("[buy-for-me] audit write failed:", e instanceof Error ? e.message : e);
  }
}

async function event(requestId: number, kind: keyof typeof BFM_EVENT_DEFS, refId: number | null = null) {
  await execute(
    `INSERT INTO swiftbox_bfm_events (request_id, kind, actor_type, ref_id, message, notify, created_at)
     VALUES (:requestId, :kind, 'customer', :refId, NULL, :notify, NOW())`,
    { requestId, kind, refId, notify: BFM_EVENT_DEFS[kind].notify ? 1 : 0 }
  );
}

/** Tell the office (info@) — never throws, never blocks the customer. */
async function alertStaff(subject: string, lines: string[]) {
  try {
    const to = STAFF_ALERT_TO();
    await getTransport().sendMail({
      from: process.env.SMTP_FROM || "Swift Box <info@swiftboxtt.com>",
      to,
      subject,
      text: lines.join("\n"),
      ...(process.env.SMTP_USER ? { envelope: { from: process.env.SMTP_USER, to } } : {}),
    });
  } catch (e) {
    console.error("[buy-for-me] staff alert failed:", e instanceof Error ? e.message : e);
  }
}

/* ───────────────────────── list + dashboard ───────────────────────── */

export async function listMyRequests(userId: number): Promise<BfmSummary[]> {
  const rows = await query<{
    id: number; status: string; created_at: string | null; customer_seen_at: string | null;
    item_count: number; total_ttd: string | null; last_notify: string | null;
  }>(
    `SELECT r.id, r.status, r.created_at, r.customer_seen_at,
            (SELECT COUNT(*) FROM swiftbox_bfm_items i WHERE i.request_id = r.id) AS item_count,
            (SELECT SUM(q.total_ttd) FROM swiftbox_bfm_quotes q WHERE q.request_id = r.id AND q.status <> 'void') AS total_ttd,
            (SELECT MAX(e.created_at) FROM swiftbox_bfm_events e WHERE e.request_id = r.id AND e.notify = 1) AS last_notify
       FROM swiftbox_bfm_requests r
      WHERE r.user_id = :userId
      ORDER BY r.id DESC
      LIMIT 100`,
    { userId }
  );
  return rows
    .filter((r) => isBfmStatus(r.status))
    .map((r) => {
      const status = r.status as BfmStatus;
      return {
        id: Number(r.id),
        no: requestNo(Number(r.id)),
        status,
        statusLabel: BFM_STATUS_LABEL[status].customer,
        itemCount: Number(r.item_count),
        totalTtdCents: r.total_ttd == null ? null : decimalToCents(r.total_ttd),
        createdAt: r.created_at,
        hasUpdate: !!r.last_notify && (!r.customer_seen_at || r.last_notify > r.customer_seen_at),
      };
    });
}

/** For the dashboard card: open requests and how many have something new. */
export async function myBuyForMeCounts(userId: number): Promise<{ open: number; updates: number }> {
  const list = await listMyRequests(userId);
  const done = new Set<BfmStatus>(["closed", "cancelled", "rejected", "refunded"]);
  return { open: list.filter((r) => !done.has(r.status)).length, updates: list.filter((r) => r.hasUpdate).length };
}

/* ───────────────────────── create ───────────────────────── */

export type NewItemInput = { productUrl: unknown; qty: unknown; variant: unknown; priceSeen: unknown; note: unknown };

export async function createRequest(
  s: SessionUser,
  input: { items: unknown; note: unknown }
): Promise<{ ok: true; id: number } | { ok: false; error: string; itemErrors?: Record<number, string> }> {
  const raw = Array.isArray(input.items) ? (input.items as NewItemInput[]) : [];
  if (raw.length === 0) return { ok: false, error: "Add at least one item." };
  if (raw.length > MAX_ITEMS_PER_REQUEST) return { ok: false, error: `At most ${MAX_ITEMS_PER_REQUEST} items per request.` };

  const itemErrors: Record<number, string> = {};
  const items = raw.map((it, i) => {
    const url = safeProductUrl(cleanText(it.productUrl, 2000));
    if (!url) itemErrors[i] = "Paste the full product link, starting with https://";
    const qty = Number(String(it.qty ?? "1").trim());
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) itemErrors[i] = `Quantity must be a whole number from 1 to ${MAX_QTY}.`;
    let priceSeen: number | null = null;
    const ps = String(it.priceSeen ?? "").trim();
    if (ps !== "") {
      const p = parseMoneyInput(ps);
      if (!p.ok) itemErrors[i] = `Price: ${p.error}`;
      else priceSeen = p.cents;
    }
    return { url, qty, variant: cleanText(it.variant, 255) || null, priceSeen, note: cleanText(it.note, 500) || null };
  });
  if (Object.keys(itemErrors).length) return { ok: false, error: "Please check the highlighted items.", itemErrors };

  const [open] = await query<{ n: number }>(
    `SELECT COUNT(*) AS n FROM swiftbox_bfm_requests WHERE user_id = :userId AND status IN ('submitted', 'quoted', 'payment_uploaded')`,
    { userId: s.id }
  );
  if (Number(open?.n ?? 0) >= MAX_OPEN_REQUESTS) {
    return { ok: false, error: "You have several requests waiting already — please finish or cancel one first, or message us." };
  }

  const note = cleanText(input.note, 500) || null;
  const ins = await execute(
    `INSERT INTO swiftbox_bfm_requests (user_id, status, customer_note, created_at, updated_at, customer_seen_at)
     VALUES (:userId, 'submitted', :note, NOW(), NOW(), NOW())`,
    { userId: s.id, note }
  );
  const id = ins.insertId;
  try {
    let n = 1;
    for (const it of items) {
      await execute(
        `INSERT INTO swiftbox_bfm_items (request_id, line_no, product_url, qty, variant, price_seen_usd, customer_note)
         VALUES (:id, :lineNo, :url, :qty, :variant, :priceSeen, :note)`,
        { id, lineNo: n++, url: it.url, qty: it.qty, variant: it.variant, priceSeen: it.priceSeen == null ? null : centsToDecimal(it.priceSeen), note: it.note }
      );
    }
    await event(id, "submitted");
  } catch (e) {
    // Compensate: never leave a request with missing items.
    await execute("DELETE FROM swiftbox_bfm_items WHERE request_id = :id", { id }).catch(() => {});
    await execute("DELETE FROM swiftbox_bfm_events WHERE request_id = :id", { id }).catch(() => {});
    await execute("DELETE FROM swiftbox_bfm_requests WHERE id = :id", { id }).catch(() => {});
    throw e;
  }
  await audit(id, "submitted", s, null, "submitted", `${items.length} item(s)`);
  await alertStaff(`New Buy For Me request ${requestNo(id)} — ${s.name} (${swiftCode(s.ac)})`, [
    `${s.name} (${swiftCode(s.ac)}) sent a Buy For Me request.`,
    "",
    ...items.map((it, i) => `${i + 1}. ${it.url} — qty ${it.qty}${it.variant ? ` — ${it.variant}` : ""}${it.note ? ` — "${it.note}"` : ""}`),
    ...(note ? ["", `Note: ${note}`] : []),
    "",
    `Quote it here: ${ADMIN_URL}/admin/buy-for-me/${id}`,
  ]);
  return { ok: true, id };
}

/* ───────────────────────── detail ───────────────────────── */

export type BfmCustomerQuote = { id: number; seq: number; ref: string; kind: "original" | "topup"; status: "awaiting_payment" | "paid"; reason: string | null; figures: QuoteFigures; paidTtdCents: number | null };

export type BfmCustomerDetail = {
  id: number;
  no: string;
  status: BfmStatus;
  statusLabel: string;
  statusReason: string | null;
  note: string | null;
  createdAt: string | null;
  items: Array<{ lineNo: number; productUrl: string | null; productText: string; qty: number; variant: string | null; priceSeenCents: number | null; note: string | null; retailerOrderNo: string | null; usTracking: string | null }>;
  quotes: BfmCustomerQuote[];
  openQuote: BfmCustomerQuote | null;
  bank: { bank: string; accountName: string; accountNumber: string; accountType: string; branch: string; instructions: string } | null;
  slips: Array<{ id: number; ref: string; status: "pending" | "confirmed" | "rejected"; uploadedAt: string | null; rejectReason: string | null }>;
  refunds: Array<{ amountTtdCents: number; method: string; date: string | null; note: string | null }>;
  packages: Array<{ pkId: number; wr: string | null }>;
  history: Array<{ title: string; message: string | null; at: string | null }>;
  canUploadSlip: boolean;
  canCancel: boolean;
};

const SHOW_ORDER_FROM = new Set<BfmStatus>(["purchased", "arrived_miami", "closed"]);

export async function getMyRequest(userId: number, id: number, opts: { markSeen?: boolean } = {}): Promise<BfmCustomerDetail | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const [r] = await query<{ id: number; status: string; status_reason: string | null; customer_note: string | null; created_at: string | null }>(
    `SELECT id, status, status_reason, customer_note, created_at FROM swiftbox_bfm_requests WHERE id = :id AND user_id = :userId LIMIT 1`,
    { id, userId }
  );
  if (!r || !isBfmStatus(r.status)) return null;
  const status = r.status as BfmStatus;

  const [items, quotes, slips, refunds, packages, events, bankRows] = await Promise.all([
    query<Record<string, unknown>>(`SELECT line_no, product_url, qty, variant, price_seen_usd, customer_note, retailer_order_no, us_tracking FROM swiftbox_bfm_items WHERE request_id = :id ORDER BY line_no`, { id }),
    query<Record<string, unknown>>(`SELECT * FROM swiftbox_bfm_quotes WHERE request_id = :id AND status <> 'void' ORDER BY seq`, { id }),
    // blob_url is deliberately NOT selected: it never leaves the server except through the slip route.
    query<Record<string, unknown>>(`SELECT id, quote_id, status, uploaded_at, reject_reason FROM swiftbox_bfm_slips WHERE request_id = :id ORDER BY id`, { id }),
    query<Record<string, unknown>>(`SELECT amount_ttd, method, refund_date, note FROM swiftbox_bfm_refunds WHERE request_id = :id ORDER BY id`, { id }),
    query<Record<string, unknown>>(`SELECT b.pk_id, p.wr FROM swiftbox_bfm_packages b LEFT JOIN mod_packages p ON p.pk_id = b.pk_id WHERE b.request_id = :id ORDER BY b.id`, { id }),
    query<Record<string, unknown>>(`SELECT kind, message, created_at FROM swiftbox_bfm_events WHERE request_id = :id ORDER BY id`, { id }),
    query<{ setting_key: string; setting_value: string }>(`SELECT setting_key, setting_value FROM swiftbox_text_settings WHERE setting_key LIKE 'bfm\\_bank\\_%'`),
  ]);

  const c = (row: Record<string, unknown>, k: string) => decimalToCents(row[k]);
  const mappedQuotes: BfmCustomerQuote[] = quotes.map((q) => ({
    id: Number(q.id),
    seq: Number(q.seq),
    ref: paymentRef(id, Number(q.seq)),
    kind: q.kind === "topup" ? "topup" : "original",
    status: q.status === "paid" ? "paid" : "awaiting_payment",
    reason: (q.reason as string | null) ?? null,
    figures: {
      feePct: Number(q.fee_pct),
      roe: Number(q.roe),
      usd: { itemValue: c(q, "item_value_usd"), usTax: c(q, "us_tax_usd"), usShipping: c(q, "us_shipping_usd"), fee: c(q, "fee_usd"), total: c(q, "total_usd") },
      ttd: { itemValue: c(q, "item_value_ttd"), usTax: c(q, "us_tax_ttd"), usShipping: c(q, "us_shipping_ttd"), fee: c(q, "fee_ttd"), total: c(q, "total_ttd") },
    },
    paidTtdCents: decimalToCentsOrNull(q.paid_ttd),
  }));
  const openQuote = mappedQuotes.find((q) => q.status === "awaiting_payment") ?? null;
  const b = Object.fromEntries(bankRows.map((x) => [x.setting_key, String(x.setting_value ?? "").trim()]));
  const bank =
    b.bfm_bank_name && b.bfm_bank_account_name && b.bfm_bank_account_number
      ? {
          bank: b.bfm_bank_name,
          accountName: b.bfm_bank_account_name,
          accountNumber: b.bfm_bank_account_number,
          accountType: b.bfm_bank_account_type ?? "",
          branch: b.bfm_bank_branch ?? "",
          instructions: b.bfm_bank_instructions ?? "",
        }
      : null;
  const hasPaid = mappedQuotes.some((q) => q.status === "paid");

  if (opts.markSeen) {
    await execute(`UPDATE swiftbox_bfm_requests SET customer_seen_at = NOW() WHERE id = :id AND user_id = :userId`, { id, userId }).catch(() => {});
  }

  return {
    id,
    no: requestNo(id),
    status,
    statusLabel: BFM_STATUS_LABEL[status].customer,
    statusReason: r.status_reason,
    note: r.customer_note,
    createdAt: r.created_at,
    items: items.map((it) => ({
      lineNo: Number(it.line_no),
      productUrl: safeProductUrl(String(it.product_url ?? "")),
      productText: String(it.product_url ?? ""),
      qty: Number(it.qty),
      variant: (it.variant as string | null) ?? null,
      priceSeenCents: decimalToCentsOrNull(it.price_seen_usd),
      note: (it.customer_note as string | null) ?? null,
      retailerOrderNo: SHOW_ORDER_FROM.has(status) ? ((it.retailer_order_no as string | null) ?? null) : null,
      usTracking: SHOW_ORDER_FROM.has(status) ? ((it.us_tracking as string | null) ?? null) : null,
    })),
    quotes: mappedQuotes,
    openQuote,
    bank: openQuote ? bank : null,
    slips: slips.map((s) => {
      const q = mappedQuotes.find((x) => x.id === Number(s.quote_id));
      return {
        id: Number(s.id),
        ref: q ? q.ref : requestNo(id),
        status: s.status === "confirmed" ? "confirmed" : s.status === "rejected" ? "rejected" : "pending",
        uploadedAt: (s.uploaded_at as string | null) ?? null,
        rejectReason: (s.reject_reason as string | null) ?? null,
      };
    }),
    refunds: refunds.map((f) => ({
      amountTtdCents: decimalToCents(f.amount_ttd),
      // Refunds are money returned by bank transfer only — there is no Buy For Me credit.
      method: isRefundMethod(f.method) ? REFUND_METHOD_LABEL[f.method].replace("back to the customer", "back to you") : "Refund",
      date: (f.refund_date as string | null) ?? null,
      note: (f.note as string | null) ?? null,
    })),
    packages: packages.map((p) => ({ pkId: Number(p.pk_id), wr: (p.wr as string | null) ?? null })),
    history: events.map((e) => {
      const def = (BFM_EVENT_DEFS as Record<string, { title: string }>)[String(e.kind)];
      return { title: def?.title ?? String(e.kind), message: (e.message as string | null) ?? null, at: (e.created_at as string | null) ?? null };
    }),
    canUploadSlip: status === "quoted" && openQuote !== null,
    canCancel: status === "submitted" || (status === "quoted" && !hasPaid),
  };
}

/* ───────────────────────── cancel ───────────────────────── */

export async function cancelMyRequest(s: SessionUser, id: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await execute(
    `UPDATE swiftbox_bfm_requests r
        SET r.status = 'cancelled', r.cancelled_by = 'customer', r.status_reason = 'Cancelled by you', r.updated_at = NOW()
      WHERE r.id = :id AND r.user_id = :userId
        AND (r.status = 'submitted'
             OR (r.status = 'quoted'
                 AND NOT EXISTS (SELECT 1 FROM swiftbox_bfm_quotes q WHERE q.request_id = r.id AND q.status = 'paid')))`,
    { id, userId: s.id }
  );
  if (res.affectedRows !== 1) {
    return { ok: false, error: "This request can no longer be cancelled here — please message the Swiftbox team on WhatsApp (868) 609-3000." };
  }
  await execute(`UPDATE swiftbox_bfm_quotes SET status = 'void', updated_at = NOW() WHERE request_id = :id AND status = 'awaiting_payment'`, { id });
  await event(id, "cancelled_by_customer");
  await audit(id, "cancelled", s, null, "cancelled", "by the customer");
  await alertStaff(`Buy For Me ${requestNo(id)} cancelled by the customer`, [
    `${s.name} (${swiftCode(s.ac)}) cancelled ${requestNo(id)} in the app.`,
    "",
    `${ADMIN_URL}/admin/buy-for-me/${id}`,
  ]);
  return { ok: true };
}

/* ───────────────────────── payment slip ───────────────────────── */

const blobToken = () => process.env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;

export type UploadResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Store the slip PRIVATELY and move the request quoted → payment_uploaded. The
 * blob URL is written to the database and never returned.
 */
export async function uploadMySlip(s: SessionUser, id: number, file: File): Promise<UploadResult> {
  if (file.size <= 0) return { ok: false, status: 400, error: "The file is empty." };
  if (file.size > SLIP_MAX_BYTES) return { ok: false, status: 413, error: "That file is too big — please send a photo or PDF under 4 MB." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = detectSlipType(bytes);
  if (!type) return { ok: false, status: 415, error: "Please upload a photo (JPG, PNG or WebP) or a PDF of your payment slip." };

  const [r] = await query<{ status: string }>(`SELECT status FROM swiftbox_bfm_requests WHERE id = :id AND user_id = :userId LIMIT 1`, { id, userId: s.id });
  if (!r) return { ok: false, status: 404, error: "Not found." };
  if (r.status !== "quoted") return { ok: false, status: 409, error: "There is no quote waiting for payment on this request." };
  const [q] = await query<{ id: number; seq: number }>(
    `SELECT id, seq FROM swiftbox_bfm_quotes WHERE request_id = :id AND status = 'awaiting_payment' ORDER BY seq DESC LIMIT 1`,
    { id }
  );
  if (!q) return { ok: false, status: 409, error: "There is no quote waiting for payment on this request." };

  const blob = await put(slipPath(id, randomSlipName(), type.ext), Buffer.from(bytes), {
    access: "private",
    contentType: type.contentType,
    addRandomSuffix: true,
    token: blobToken(),
  });

  let slipId = 0;
  try {
    const ins = await execute(
      `INSERT INTO swiftbox_bfm_slips (request_id, quote_id, blob_url, content_type, size_bytes, original_name, status, uploaded_at)
       VALUES (:id, :quoteId, :url, :type, :size, :name, 'pending', NOW())`,
      { id, quoteId: q.id, url: blob.url, type: type.contentType, size: file.size, name: cleanText(file.name, 255) || null }
    );
    slipId = ins.insertId;
    const moved = await execute(
      `UPDATE swiftbox_bfm_requests SET status = 'payment_uploaded', updated_at = NOW() WHERE id = :id AND user_id = :userId AND status = 'quoted'`,
      { id, userId: s.id }
    );
    if (moved.affectedRows !== 1) throw new Error("status moved");
  } catch {
    if (slipId) await execute("DELETE FROM swiftbox_bfm_slips WHERE id = :slipId", { slipId }).catch(() => {});
    await del(blob.url, { token: blobToken() }).catch(() => {});
    return { ok: false, status: 409, error: "This request changed a moment ago — please reload the page." };
  }

  await event(id, "slip_uploaded", q.id);
  await audit(id, "slip_uploaded", s, "quoted", "payment_uploaded", `slip #${slipId} for ${paymentRef(id, Number(q.seq))}`);
  await alertStaff(`Payment slip for Buy For Me ${paymentRef(id, Number(q.seq))} — please check`, [
    `${s.name} (${swiftCode(s.ac)}) uploaded a payment slip for ${paymentRef(id, Number(q.seq))}.`,
    "",
    "Check the money is in the bank, then confirm or reject it here:",
    `${ADMIN_URL}/admin/buy-for-me/${id}`,
  ]);
  return { ok: true };
}

/** The customer's OWN slip as bytes, or null (404) — for someone else's, a logged-out visitor, or a missing one. */
export async function readMySlip(userId: number, slipId: number): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  if (!Number.isInteger(slipId) || slipId <= 0) return null;
  const [row] = await query<{ blob_url: string }>(
    `SELECT s.blob_url FROM swiftbox_bfm_slips s JOIN swiftbox_bfm_requests r ON r.id = s.request_id
      WHERE s.id = :slipId AND r.user_id = :userId LIMIT 1`,
    { slipId, userId }
  );
  if (!row?.blob_url) return null;
  const res = await get(row.blob_url, { access: "private", token: blobToken(), useCache: false });
  if (!res || res.statusCode !== 200) return null;
  return { stream: res.stream, contentType: res.blob.contentType };
}

export const TOTAL_FROM = (q: QuoteFigures) => q.ttd.total;
