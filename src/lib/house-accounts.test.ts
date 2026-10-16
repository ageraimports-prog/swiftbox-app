import { beforeEach, describe, expect, it, vi } from "vitest";
import { billTotals } from "./consolidatedBillingCore";
import { STATUS_BADGE } from "./invoice-line";
import { invoiceMoney, invoicePaymentStatus } from "./invoice-money-core";

const state = vi.hoisted(() => ({ column: true, house: true, user: 123, queries: [] as { sql: string; params: unknown }[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ getSession: async () => ({ id: state.user }) }));
vi.mock("@/lib/consolidated-billing", () => ({ cbHiddenInvoiceIds: async () => new Set(), listCbBills: async () => [], cbBillNoForInvoice: async () => null, cbBillForInvoice: async () => null }));
vi.mock("@/lib/db", () => ({ query: async (sql: string, params: unknown) => {
  state.queries.push({ sql, params });
  if (sql.includes("information_schema.COLUMNS")) return state.column ? [{ COLUMN_NAME: "house_account" }] : [];
  if (sql.includes("FROM swiftbox_invoices") && !sql.includes("JOIN swiftbox_invoice_packages")) return [{
    invoice_id: 1, invoice_no: "INV-123", scope: "package", ship_no: "test", status: state.house ? "house" : "unpaid",
    house_account: state.house ? 1 : 0, billing_mode: "air", roe: "6.8", shipping_ttd: "200", customs_total_ttd: "100",
    total_ttd: "300", amount_paid: "0", created_at: "2026-10-16",
  }];
  return [];
} }));

describe("No-charge customer invoices", () => {
  beforeEach(() => { state.column = true; state.house = true; state.queries = []; });
  it("list API retains value, returns zero balance and preserves ownership scope", async () => {
    const { GET } = await import("../app/api/invoices/route");
    const body = await (await GET()).json();
    expect(body.invoices[0]).toMatchObject({ totalTtd: 300, amountPaid: 0, balance: 0, status: "house", houseAccount: true });
    expect(state.queries.some((q) => q.sql.includes("user_id = :userId") && JSON.stringify(q.params).includes("123"))).toBe(true);
  });
  it("detail API keeps all invoice value with nothing owed", async () => {
    const { GET } = await import("../app/api/invoices/[invoiceNo]/route");
    const body = await (await GET(new Request("https://test.invalid/api/invoices/INV-123"), { params: Promise.resolve({ invoiceNo: "INV-123" }) })).json();
    expect(body.invoice).toMatchObject({ totalTtd: 300, shippingTtd: 200, customsTotalTtd: 100, amountPaid: 0, balance: 0, houseAccount: true });
  });
  it("missing invoice column uses a projection without naming it", async () => {
    state.column = false; state.house = false;
    const { invoiceHouseColumn } = await import("./house-accounts");
    expect(await invoiceHouseColumn()).toBe("IF(status = 'house',1,0) AS house_account");
    const { GET } = await import("../app/api/invoices/route");
    const body = await (await GET()).json();
    expect(body.invoices[0]).toMatchObject({ status: "unpaid", balance: 300, houseAccount: false });
  });
  it("all-house and mixed bills sum value but collect only normal children", () => {
    const house = { houseAccount: true, totalTtd: 300, amountPaid: 0, lines: [] };
    expect(billTotals([house])).toMatchObject({ totalTtd: 300, dueTtd: 0, status: "house" });
    expect(billTotals([house, { ...house, houseAccount: false, totalTtd: 100 }])).toMatchObject({ totalTtd: 400, dueTtd: 100, status: "unpaid" });
    expect(STATUS_BADGE.house.label).toBe("No charge");
  });
  it("shared invoice money reader preserves value without inventing settlement", () => {
    expect(invoiceMoney([{ lineType: "freight", description: "Freight", amountTtd: 300, basis: null }], 300, 0, true)).toMatchObject({ chargesTotalTtd: 300, balance: 0, status: "house", discount: null });
    expect(invoicePaymentStatus(300, 0, true)).toBe("house");
  });
});
