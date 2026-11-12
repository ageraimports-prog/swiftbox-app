import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// ISSUE = VISIBLE AND PAYABLE (Brent, 2026-11-12). A Consolidated Billing (combined)
// invoice IS an invoice: once issued the customer sees it in the list, opens it and
// pays it (Pay now / PayPal). INV-000213 / CB-000040 (SWIFT-0581) was issued and
// emailed on 12 Nov and could not be paid: the list showed only the bill card, the
// bill page had no Pay, and a lagging draft bill row hid everything.
const read = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const lib = read("src/lib/consolidated-billing.ts");

describe("Issue = visible and payable", () => {
  it("a bill reads issued once every invoice on it is issued (the admin's effectiveBillLifecycleSql)", () => {
    const fn = lib.slice(lib.indexOf("export function billIssuedSql"), lib.indexOf("export function billIssuedSql") + 700);
    expect(fn).toContain("lifecycle = 'issued' OR");
    expect(fn).toContain("lifecycle = 'draft'");
    expect(fn).toMatch(/NOT EXISTS[\s\S]*ei\.lifecycle <> 'issued'/);
  });

  it("the bill list, the bill page and the invoice's bill link all read it", () => {
    expect(lib).toContain("AND ${billIssuedSql(B)} ORDER BY bill_id DESC");
    expect(lib).toContain("AND ${billIssuedSql(B)} LIMIT 1");
    expect(lib).toContain(`IF(\${billIssuedSql("b")}, 'issued', b.lifecycle) AS lifecycle`);
  });

  it("only a LEGACY several-invoice bill hides its invoices from the list", () => {
    const fn = lib.slice(lib.indexOf("export async function cbHiddenInvoiceIds"), lib.indexOf("type ChildRow"));
    expect(fn).toMatch(/SELECT COUNT\(\*\) FROM \$\{BI\} x WHERE x\.bill_id = b\.bill_id\) > 1/);
    // A held invoice is still hidden, judged on the effective bill lifecycle.
    expect(fn).toContain("cb_bill_effective_issued");
    expect(fn).toContain("isCbHeld(cbMembershipFromRow(row))");
  });

  it("the invoices list shows a one-invoice bill as its invoice, not as a second bill card", () => {
    expect(read("src/app/api/invoices/route.ts")).toContain("bills: bills.filter((b) => b.invoices.length > 1).map((b) => ({");
  });

  it("the bill page offers Pay for each invoice with something owed", () => {
    const page = read("src/app/dashboard/bills/[billNo]/page.tsx");
    expect(page).toMatch(/filter\(\(i\) => !i\.houseAccount && i\.balance > 0\)/);
    expect(page).toContain("/dashboard/invoices/${encodeURIComponent(i.invoiceNo)}?pay=1");
  });
});
