import { describe, expect, it, vi } from "vitest";

/**
 * No declared value leaves the invoice API (Brent, 2026-11-14, restated
 * 2026-11-20). The stored lines below carry declared values the way the admin
 * writes them: insurance above the minimum (qty = the declared value), the
 * minimum's note, group wording, and customs lines whose qty is the CIF base.
 * None of those figures may reach the customer's phone, shown or not.
 */
const V1 = "4321.87";
const COMBINED = "6309.30";
const CIF = "29876.54";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/session", () => ({ getSession: async () => ({ id: 123 }) }));
vi.mock("@/lib/consolidated-billing", () => ({ cbHiddenInvoiceIds: async () => new Set(), listCbBills: async () => [], cbBillNoForInvoice: async () => null, cbBillForInvoice: async () => null }));
vi.mock("@/lib/db", () => ({ query: async (sql: string) => {
  if (sql.includes("information_schema.COLUMNS")) return [{ COLUMN_NAME: "house_account" }];
  if (sql.includes("FROM swiftbox_invoice_lines")) return [
    { line_type: "freight", description: "Freight", currency: "USD", amount: "9.95", amount_ttd: "67.66", qty: "5", unit: "lb", rate: "1.99", basis: null },
    { line_type: "insurance", description: "Insurance", currency: "USD", amount: "4.32", amount_ttd: "29.38", qty: V1, unit: "USD", rate: "0.001", basis: `one premium on combined declared value US$${COMBINED}` },
    { line_type: "insurance", description: "Insurance", currency: "USD", amount: "2", amount_ttd: "13.60", qty: "1", unit: "min", rate: "2", basis: `minimum (declared US$${V1} would be US$0.43)` },
    { line_type: "duty", description: "Customs Duty", currency: "TTD", amount: "120.50", amount_ttd: "120.50", qty: CIF, unit: "TT$", rate: "0.004033", basis: "20% of CIF" },
    { line_type: "vat", description: "VAT", currency: "TTD", amount: "80.41", amount_ttd: "80.41", qty: CIF, unit: "TT$", rate: "0.002691", basis: "12.5% of CIF + duty + OPT" },
  ];
  if (sql.includes("FROM swiftbox_invoices") && !sql.includes("JOIN swiftbox_invoice_packages")) return [{
    invoice_id: 1, invoice_no: "INV-123", scope: "package", ship_no: "test", status: "unpaid",
    house_account: 0, billing_mode: "air", roe: "6.8", shipping_ttd: "110.64", customs_total_ttd: "200.91",
    total_ttd: "311.55", amount_paid: "0", created_at: "2026-11-20",
  }];
  return [];
} }));

describe("the invoice API never sends a declared value", () => {
  it("strips it from every line's qty and wording", async () => {
    vi.stubGlobal("fetch", async () => new Response("Not found", { status: 404 }));
    const { GET } = await import("../app/api/invoices/[invoiceNo]/route");
    const res = await GET(new Request("https://test.invalid/api/invoices/INV-123"), { params: Promise.resolve({ invoiceNo: "INV-123" }) });
    const text = JSON.stringify(await res.json());
    for (const figure of [V1, "4,321.87", COMBINED, "6309.3", CIF, "29,876.54"]) expect(text).not.toContain(figure);
    expect(text).not.toMatch(/declared\s*(value\s*)?(US)?\$/i);
    const body = JSON.parse(text);
    const duty = body.invoice.lines.find((l: { lineType: string }) => l.lineType === "duty");
    expect(duty).toMatchObject({ qty: null, basis: "20% of CIF", amountTtd: 120.5 });
    const freight = body.invoice.lines.find((l: { lineType: string }) => l.lineType === "freight");
    expect(freight).toMatchObject({ qty: 5, rate: 1.99 });
    vi.unstubAllGlobals();
  });
});
