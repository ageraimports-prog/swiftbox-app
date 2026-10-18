import { describe, expect, it } from "vitest";
import { DISCOUNT_BASIS, OWNER_LINE_BASIS, discountRowLabel, invoiceMoney, invoicePaymentStatus } from "./invoice-money-core";

// invoice-money-core.ts is CODE-IDENTICAL to the admin's lib/invoice-money-core.ts
// (tested there by scripts/test-invoice-discount.ts). These cases are the same.
const lines = [
  { lineType: "freight", description: "Freight", amountTtd: 67.66, basis: null },
  { lineType: "duty", description: "Customs Duty", amountTtd: 44.96, basis: "20% of CIF" },
  { lineType: "other", description: "Referral credit", amountTtd: -50, basis: null },
  { lineType: "adjustment", description: "Shipping waived — x", amountTtd: -10, basis: "waived" },
  { lineType: "other", description: "Discount (Goodwill – delayed delivery)", amountTtd: -52.62, basis: DISCOUNT_BASIS },
];

describe("invoiceMoney", () => {
  it("shows the owner's discount as a Discount, not a referral credit", () => {
    const m = invoiceMoney(lines, 0, 0);
    expect(m.chargeLines.some((l) => l.basis === DISCOUNT_BASIS)).toBe(false);
    expect(m.chargeLines).toHaveLength(4);
    expect(m.discount).toEqual({ amountTtd: 52.62, reason: "Goodwill – delayed delivery" });
    expect(m.referralCreditTtd).toBe(-50);
    expect(m.chargesTotalTtd).toBe(52.62);
  });

  it("an invoice discounted to 0 is Paid, not owing", () => {
    const m = invoiceMoney(lines, 0, 0);
    expect(m.balance).toBe(0);
    expect(m.status).toBe("paid");
  });

  it("no discount: unchanged reading", () => {
    const m = invoiceMoney(lines.slice(0, 3), 62.62, 20);
    expect(m.discount).toBeNull();
    expect(m.chargesTotalTtd).toBe(62.62);
    expect(m.balance).toBe(42.62);
    expect(m.status).toBe("partial");
  });

  it("status follows the money columns", () => {
    expect(invoicePaymentStatus(100, 0)).toBe("unpaid");
    expect(invoicePaymentStatus(100, 40)).toBe("partial");
    expect(invoicePaymentStatus(100, 100)).toBe("paid");
    expect(invoicePaymentStatus(100, 200)).toBe("paid");
    expect(invoicePaymentStatus(0, 0)).toBe("paid");
  });

  it("an owner-added credit shows under its own words, never as Referral credit", () => {
    const owner = [
      ...lines.slice(0, 3),
      { lineType: "other", description: "Storage fee", amountTtd: 25, basis: OWNER_LINE_BASIS },
      { lineType: "other", description: "Goodwill credit", amountTtd: -10, basis: OWNER_LINE_BASIS },
    ];
    const m = invoiceMoney(owner, 77.62, 0);
    expect(m.referralCreditTtd).toBe(-50);
    expect(m.ownerCredits).toEqual([{ description: "Goodwill credit", amountTtd: -10 }]);
    expect(m.chargeLines).toHaveLength(5);
  });

  it("the discount row shows its label once", () => {
    expect(discountRowLabel("Discount")).toBe("Discount");
    expect(discountRowLabel("")).toBe("Discount");
    expect(discountRowLabel("Delivery delay")).toBe("Discount (Delivery delay)");
  });
});
