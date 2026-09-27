import { describe, it, expect } from "vitest";
import * as copy from "./consolidatedBilling";
import { packageSection, billTotals, groupDisplay, windowDay, ttDateLabel } from "./consolidatedBillingCore";

const allCopy = [
  copy.CB_SHORT_LINE,
  copy.CB_LONG_DESCRIPTION,
  copy.CB_OFF_CONFIRM,
  copy.CB_WAITING_LABEL,
  copy.CB_CLOSED_CARD,
  copy.cbOpenCardText(3, "Sat 17 Oct"),
  copy.cbBillReadyText("CB-000001"),
  ...copy.CB_FAQ.flatMap((f) => [f.q, f.a]),
].join("\n");

describe("Consolidated Billing copy (Brent's rules, 27 Sep 2026)", () => {
  it("R13: never says Trinidad or held", () => {
    expect(allCopy).not.toMatch(/trinidad|\bheld\b|holding/i);
  });
  it("uses the exact brief wording", () => {
    expect(copy.CB_OFF_CONFIRM).toBe("Turning this off sends out what's ready now.");
    expect(copy.CB_WAITING_LABEL).toBe("Consolidated Billing: waiting for your group");
    expect(copy.cbOpenCardText(3, "Sat 17 Oct")).toBe(
      "Consolidated Billing: Free. Day 3 of 20. Packages that reach our Miami warehouse by Sat 17 Oct go out together."
    );
    expect(copy.CB_CLOSED_CARD).toBe("Your window has closed. We'll send everything out as soon as your last package lands.");
    expect(copy.CB_LONG_DESCRIPTION).toBe(
      "Ordering from more than one store? Turn on Consolidated Billing and everything that reaches our Miami warehouse within 20 days comes to your door together, with one bill. Free."
    );
  });
  it("HOLD_DAYS is 20", () => expect(copy.HOLD_DAYS).toBe(20));
  it("has the nine FAQ entries", () => expect(copy.CB_FAQ).toHaveLength(9));
  it("US$1.99 always carries the 20% fuel on the same line", () => {
    for (const line of allCopy.split("\n")) if (line.includes("US$1.99")) expect(line).toMatch(/20% fuel/);
  });
  it("no banned claims", () => {
    expect(allCopy).not.toMatch(/cheapest|hidden fees|business days|\bhours?\b|guarantee/i);
  });
  it("the only phone number is (868) 609-3000", () => {
    const phones = allCopy.match(/\(\d{3}\) \d{3}-\d{4}/g) ?? [];
    expect(phones.every((p) => p === "(868) 609-3000")).toBe(true);
  });
  it("WhatsApp is prefilled with the customer's code", () => {
    expect(copy.cbWhatsAppUrl("SWIFT-0406")).toBe(
      "https://wa.me/18686093000?text=" + encodeURIComponent("Hi Swiftbox, I'd like Consolidated Billing. My code is SWIFT-0406")
    );
    expect(copy.SWIFTBOX_TEL).toBe("tel:+18686093000");
  });
  it("SWIFT code from a dirty users.ac", () => {
    expect(copy.swiftCodeFromAc("\t406 ")).toBe("SWIFT-0406");
    expect(copy.swiftCodeFromAc(12)).toBe("SWIFT-0012");
  });
});

describe("Consolidated Bill arithmetic (mirrors the admin core)", () => {
  const air = [
    { lineType: "freight", description: "Freight", amountTtd: 40.6 },
    { lineType: "fuel", description: "Fuel surcharge (20%)", amountTtd: 8.12 },
    { lineType: "insurance", description: "Insurance", amountTtd: 13.6 },
    { lineType: "duty", description: "Customs Duty", amountTtd: 34.01 },
    { lineType: "opt", description: "OPT", amountTtd: 47.6 },
    { lineType: "vat", description: "VAT", amountTtd: 42.7 },
  ];
  const ocean = [
    { lineType: "freight", description: "Freight (ocean rate)", amountTtd: 30.1 },
    { lineType: "insurance", description: "Insurance", amountTtd: 13.6 },
    { lineType: "duty", description: "Customs Duty", amountTtd: 10.2 },
    { lineType: "vat", description: "VAT", amountTtd: 16.2 },
    { lineType: "other", description: "Referral credit", amountTtd: -20 },
  ];
  it("bill total = Σ children to the cent, with an ocean child and a credit", () => {
    const t = billTotals([
      { totalTtd: 186.63, amountPaid: 0, lines: air },
      { totalTtd: 50.1, amountPaid: 20.1, lines: ocean },
    ]);
    expect(t.totalTtd).toBe(236.73);
    expect(t.creditsTtd).toBe(-20);
    expect(t.chargesTtd).toBe(256.73);
    expect(t.paidTtd).toBe(20.1);
    expect(t.dueTtd).toBe(216.63);
    expect(t.status).toBe("partial");
  });
  it("0.1 + 0.2 does not drift", () => {
    expect(billTotals([{ totalTtd: 0.1, amountPaid: 0, lines: [] }, { totalTtd: 0.2, amountPaid: 0, lines: [] }]).totalTtd).toBe(0.3);
  });
  it("per item: duty / OPT / VAT from the invoice's own lines; ocean shows no OPT", () => {
    const a = packageSection(air, [{ description: "SHOES", declaredValueUsd: 80 }]);
    expect([a.items[0].dutyTtd, a.items[0].optTtd, a.items[0].vatTtd]).toEqual([34.01, 47.6, 42.7]);
    expect(a.subtotalTtd).toBe(186.63);
    const o = packageSection(ocean, [{ description: "HOUSEHOLD", declaredValueUsd: 60 }]);
    expect(o.items[0].optTtd).toBe(0);
    expect(o.creditsTtd).toBe(-20);
  });
  it("R7: released members show the last arrival's stage and date", () => {
    expect(groupDisplay([
      { shipStatus: 3, awaitingDate: "2026-10-20" },
      { shipStatus: 4, awaitingDate: "2026-10-12" },
    ])).toEqual({ shipStatus: 3, awaitingDate: "2026-10-20" });
  });
  it("Day X of 20 counts calendar days in Trinidad time", () => {
    const first = new Date(Date.UTC(2026, 9, 1, 14)); // 10:00 T&T, 1 Oct
    expect(windowDay(first, new Date(Date.UTC(2026, 9, 2, 3, 30)))).toBe(1); // 23:30 T&T, still 1 Oct
    expect(windowDay(first, new Date(Date.UTC(2026, 9, 12, 14)))).toBe(12);
    expect(windowDay(first, new Date(Date.UTC(2026, 10, 30, 14)))).toBe(20);
    expect(ttDateLabel(new Date(Date.UTC(2026, 9, 21, 3, 59, 59)))).toMatch(/20 Oct/);
  });
});
