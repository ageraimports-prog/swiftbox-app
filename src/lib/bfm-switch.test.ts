import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Buy For Me switch (src/lib/bfm-switch-core.ts): OFF hides and blocks,
 * ON is exactly today's behaviour. Fake bridge, fake blob store, fake SMTP —
 * nothing leaves the machine.
 */

const db = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn() }));
const blob = vi.hoisted(() => ({ put: vi.fn(), del: vi.fn(), get: vi.fn() }));
const mail = vi.hoisted(() => ({ sendMail: vi.fn() }));
const sess = vi.hoisted(() => ({ getSession: vi.fn() }));
vi.mock("@/lib/db", () => db);
vi.mock("@vercel/blob", () => blob);
vi.mock("@/lib/email", () => ({ getTransport: () => mail }));
vi.mock("@/lib/session", () => sess);

import { BFM_PAUSED_MESSAGE, bfmEnabledFromValue, MIAMI_ADDRESS_PATH } from "./bfm-switch-core";

const session = { id: 364, ac: "0364", name: "Demo Customer", email: "demo@swiftbox-harness.test" };
let switchValue: string | null = null; // null = no row
let switchThrows = false;

const QUOTE = {
  id: 9, request_id: 45, seq: 0, kind: "original", status: "awaiting_payment", reason: null, fee_pct: "15.00", roe: "6.8000",
  item_value_usd: "10.00", us_tax_usd: "0.00", us_shipping_usd: "0.00", fee_usd: "1.50", total_usd: "11.50",
  item_value_ttd: "68.00", us_tax_ttd: "0.00", us_shipping_ttd: "0.00", fee_ttd: "10.20", total_ttd: "78.20", paid_ttd: null,
};

function fakeBridge(requestStatus = "quoted") {
  db.query.mockImplementation(async (sql: string, params?: Record<string, unknown>) => {
    if (sql.includes("FROM swiftbox_settings WHERE setting_key = :key")) {
      if (params?.key !== "bfm_enabled") throw new Error("unexpected switch key");
      if (switchThrows) throw new Error("bridge exploded");
      return switchValue == null ? [] : [{ setting_value: switchValue }];
    }
    if (sql.includes("'bfm_fee_pct'")) return [{ setting_value: "15.0000" }];
    if (sql.includes("COUNT(*) AS n FROM swiftbox_bfm_requests")) return [{ n: 0 }];
    if (sql.includes("FROM swiftbox_bfm_requests WHERE id = :id AND user_id = :userId")) {
      return [{ id: 45, status: requestStatus, status_reason: null, customer_note: null, created_at: "2026-10-01 13:42:32" }];
    }
    // The list (its subqueries name other tables, so it is matched first).
    if (sql.includes("swiftbox_bfm_requests r") && sql.includes("ORDER BY r.id DESC")) {
      return [{ id: 45, status: requestStatus, created_at: "2026-10-01 13:42:32", customer_seen_at: null, item_count: 1, last_notify: null }];
    }
    if (sql.includes("FROM swiftbox_bfm_items")) return [{ line_no: 1, product_url: "https://www.amazon.com/dp/B000TEST", qty: 1, variant: null, price_seen_usd: null, customer_note: null, retailer_order_no: null, us_tracking: null }];
    if (sql.includes("FROM swiftbox_bfm_quotes WHERE request_id = :id AND status <> 'void'")) return requestStatus === "quoted" ? [QUOTE] : [];
    if (sql.includes("FROM swiftbox_bfm_quotes WHERE request_id = :id AND status = 'awaiting_payment'")) return [{ id: 9, seq: 0 }];
    if (sql.includes("FROM swiftbox_text_settings")) {
      return [
        { setting_key: "bfm_bank_name", setting_value: "Test Bank" },
        { setting_key: "bfm_bank_account_name", setting_value: "Swiftbox" },
        { setting_key: "bfm_bank_account_number", setting_value: "000111" },
      ];
    }
    if (sql.includes("swiftbox_bfm_")) return [];
    throw new Error("unexpected SQL: " + sql);
  });
  db.execute.mockResolvedValue({ affectedRows: 1, insertId: 46 });
}

const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], "slip.png", { type: "image/png" });

beforeEach(() => {
  vi.resetModules();
  db.query.mockReset();
  db.execute.mockReset();
  blob.put.mockReset();
  blob.del.mockReset();
  mail.sendMail.mockReset();
  mail.sendMail.mockResolvedValue({});
  sess.getSession.mockReset();
  sess.getSession.mockResolvedValue(session);
  blob.put.mockResolvedValue({ url: "https://store.private.blob.vercel-storage.com/bfm-slips/45/x.png" });
  switchValue = null;
  switchThrows = false;
  fakeBridge();
});

const ON = () => { switchValue = "1.0000"; };
const OFF = () => { switchValue = "0.0000"; };

describe("bfmEnabledFromValue — only exactly 1 is ON", () => {
  it("reads 1 as on", () => {
    expect(bfmEnabledFromValue("1.0000")).toBe(true);
    expect(bfmEnabledFromValue(1)).toBe(true);
  });
  it.each([null, undefined, "", " ", "0.0000", 0, "0.5", "2", "yes", "true", true, {}, NaN])("reads %s as off", (v) => {
    expect(bfmEnabledFromValue(v)).toBe(false);
  });
  it("says what the brief says, and links the Miami address", () => {
    expect(BFM_PAUSED_MESSAGE).toBe(
      "Buy For Me is paused for now. You can still shop any US store yourself and ship to your free Miami address."
    );
    expect(MIAMI_ADDRESS_PATH).toBe("/dashboard/account");
  });
});

describe("isBfmEnabled — fails closed", () => {
  it("row 1 → on; row 0 → off; no row → off", async () => {
    const { isBfmEnabled } = await import("./bfm-switch");
    ON();
    expect(await isBfmEnabled()).toBe(true);
    OFF();
    expect(await isBfmEnabled()).toBe(false);
    switchValue = null;
    expect(await isBfmEnabled()).toBe(false);
  });
  it("a failed read → off, never a throw", async () => {
    const { isBfmEnabled } = await import("./bfm-switch");
    switchThrows = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await isBfmEnabled()).toBe(false);
    spy.mockRestore();
  });
});

describe("OFF — new requests and payments are refused", () => {
  it.each([["row 0", OFF], ["no row", () => { switchValue = null; }]])("createRequest refuses (%s) and writes nothing", async (_l, set) => {
    set();
    const { createRequest } = await import("./buy-for-me");
    const r = await createRequest(session, { items: [{ productUrl: "https://www.amazon.com/dp/B000TEST", qty: "1" }], note: "" });
    expect(r).toEqual({ ok: false, error: BFM_PAUSED_MESSAGE, paused: true });
    expect(db.execute).not.toHaveBeenCalled();
    expect(mail.sendMail).not.toHaveBeenCalled();
  });
  it("uploadMySlip refuses with 403 before reading or storing anything", async () => {
    OFF();
    const { uploadMySlip } = await import("./buy-for-me");
    const r = await uploadMySlip(session, 45, png());
    expect(r).toEqual({ ok: false, status: 403, error: BFM_PAUSED_MESSAGE });
    expect(blob.put).not.toHaveBeenCalled();
    expect(db.execute).not.toHaveBeenCalled();
  });
  it("POST /api/buy-for-me → 403 paused", async () => {
    OFF();
    const { POST } = await import("@/app/api/buy-for-me/route");
    const res = await POST(new Request("http://x/api/buy-for-me", { method: "POST", body: JSON.stringify({ items: [{ productUrl: "https://www.amazon.com/dp/B000TEST" }] }) }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: BFM_PAUSED_MESSAGE, paused: true });
    expect(db.execute).not.toHaveBeenCalled();
  });
  it("POST /api/buy-for-me/45/slip → 403 paused", async () => {
    OFF();
    const { POST } = await import("@/app/api/buy-for-me/[id]/slip/route");
    const form = new FormData();
    form.append("file", png());
    const res = await POST(new Request("http://x/api/buy-for-me/45/slip", { method: "POST", body: form }), { params: Promise.resolve({ id: "45" }) });
    expect(res.status).toBe(403);
    expect((await res.json()).paused).toBe(true);
    expect(blob.put).not.toHaveBeenCalled();
  });
});

describe("OFF — existing requests stay visible, read-only", () => {
  it("GET /api/buy-for-me still lists the customer's requests", async () => {
    OFF();
    const { GET } = await import("@/app/api/buy-for-me/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).requests).toHaveLength(1);
  });
  it("a quoted request is shown with its quote, but no bank details and no upload", async () => {
    OFF();
    const { getMyRequest } = await import("./buy-for-me");
    const d = await getMyRequest(364, 45);
    expect(d?.paused).toBe(true);
    expect(d?.openQuote?.ref).toBe("BFM-00045");
    expect(d?.bank).toBeNull();
    expect(d?.canUploadSlip).toBe(false);
    expect(d?.canCancel).toBe(true);
  });
});

describe("ON — exactly today's behaviour", () => {
  it("createRequest creates the request and alerts the office", async () => {
    ON();
    const { createRequest } = await import("./buy-for-me");
    const r = await createRequest(session, { items: [{ productUrl: "https://www.amazon.com/dp/B000TEST", qty: "1" }], note: "" });
    expect(r).toEqual({ ok: true, id: 46 });
    expect(db.execute.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO swiftbox_bfm_requests"))).toBe(true);
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
  });
  it("POST /api/buy-for-me → 200", async () => {
    ON();
    const { POST } = await import("@/app/api/buy-for-me/route");
    const res = await POST(new Request("http://x/api/buy-for-me", { method: "POST", body: JSON.stringify({ items: [{ productUrl: "https://www.amazon.com/dp/B000TEST" }] }) }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id: 46 });
  });
  it("a quoted request shows the bank details and lets the customer upload", async () => {
    ON();
    const { getMyRequest } = await import("./buy-for-me");
    const d = await getMyRequest(364, 45);
    expect(d?.paused).toBe(false);
    expect(d?.bank?.accountNumber).toBe("000111");
    expect(d?.canUploadSlip).toBe(true);
  });
  it("uploadMySlip stores the slip privately", async () => {
    ON();
    const { uploadMySlip } = await import("./buy-for-me");
    const r = await uploadMySlip(session, 45, png());
    expect(r).toEqual({ ok: true });
    expect(blob.put).toHaveBeenCalledTimes(1);
    expect(blob.put.mock.calls[0][2]).toMatchObject({ access: "private" });
  });
});
