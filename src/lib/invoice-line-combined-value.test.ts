import { describe, it, expect } from "vitest";
import { invoiceLineBasis, withoutCombinedValue, withoutDeclaredValue } from "./invoice-line";

// Customers never see the combined declared value (Brent, 2026-11-14).
describe("group insurance wording never shows the combined declared value", () => {
  it("cleans the wording older lines stored", () => {
    expect(withoutCombinedValue("CB-000010: share of US$2.00 group insurance on US$74.68")).toBe("CB-000010: share of US$2.00 group insurance");
    expect(withoutCombinedValue("one premium on combined value US$1,120.50")).toBe("one premium for all packages");
    expect(withoutCombinedValue(null)).toBeNull();
  });
  it("an insurance line's wording on the invoice page carries the charge only", () => {
    const b = invoiceLineBasis({ qty: 2, unit: "USD", rate: 1, basis: "CB-000005: share of US$2.00 group insurance on US$120.00", lineType: "insurance", currency: "USD" });
    expect(b.main).toBe("CB-000005: share of US$2.00 group insurance");
    expect(b.main).not.toContain("120.00");
  });
  // No declared value of any kind on a customer invoice (Brent, 2026-11-14).
  it("the insurance minimum never names the declared value", () => {
    const b = invoiceLineBasis({ qty: 1, unit: "min", rate: 2, basis: "minimum (declared US$41.45 would be US$0.04)", lineType: "insurance", currency: "USD" });
    expect(b).toEqual({ main: "minimum US$2.00", note: null });
    expect(withoutDeclaredValue("minimum (declared US$41.45 would be US$0.04)")).toBe("minimum");
    expect(withoutDeclaredValue("US$1.00 per US$100 declared")).toBe("US$1.00 per US$100 declared");
  });
  it("an insurance qty (the declared value) is never multiplied out", () => {
    expect(invoiceLineBasis({ qty: 41.45, unit: "USD", rate: 0.01, basis: null, lineType: "insurance", currency: "USD" }).main).toBe("");
  });
  it("leaves every other line alone", () => {
    const f = invoiceLineBasis({ qty: 3, unit: "lb", rate: 1.99, basis: "CB-1: 3 lb share of 5 lb group weight", lineType: "freight", currency: "USD" });
    expect(f.main).toBe("CB-1: 3 lb share of 5 lb group weight");
  });
});
