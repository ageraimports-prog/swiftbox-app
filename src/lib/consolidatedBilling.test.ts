import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import * as copy from "./consolidatedBilling";
import { packageSection, billTotals, groupDisplay, windowDay, ttDateLabel } from "./consolidatedBillingCore";

const allCopy = [
  copy.CB_SHORT_LINE,
  copy.CB_LONG_DESCRIPTION,
  copy.CB_OFF_CONFIRM,
  copy.CB_WAITING_LABEL,
  copy.CB_CLOSED_CARD,
  copy.CB_ON_TEXT,
  copy.CB_TOGETHER_LINE,
  copy.cbBillReadyText("CB-000001"),
  copy.CB_EXISTING_INCLUDED,
  copy.cbEnrolledText(1),
  copy.cbEnrolledText(3),
  ...copy.CB_FAQ.flatMap((f) => [f.q, f.a]),
].join("\n");

describe("Consolidated Billing copy (Brent's rules, 27 Sep 2026)", () => {
  it("R13: never says Trinidad or held", () => {
    expect(allCopy).not.toMatch(/trinidad|\bheld\b|holding/i);
  });
  it("uses the exact brief wording", () => {
    expect(copy.CB_OFF_CONFIRM).toBe("Turning this off sends out what's ready now.");
    expect(copy.CB_WAITING_LABEL).toBe("Consolidated Billing: waiting for your group");
    expect(copy.CB_TOGETHER_LINE).toBe(
      "With Consolidated Billing we consolidate your packages and deliver them together: one delivery, one bill."
    );
    expect(copy.CB_ON_TEXT).toBe(
      "Consolidated Billing is on. Free. We consolidate your packages and deliver them together: one delivery, one bill."
    );
    expect(copy.CB_CLOSED_CARD).toBe("Your group is complete. We'll deliver your packages together, with one bill.");
    expect(copy.CB_LONG_DESCRIPTION).toBe(
      "Ordering from more than one store? With Consolidated Billing we consolidate your packages and deliver them together: one delivery, one bill — its freight charged on the combined weight, rounded up once, and its insurance once on the combined value. Free."
    );
  });
  it("turning it on includes packages already with us (2026-10-03), never 'future packages only'", () => {
    expect(copy.CB_EXISTING_INCLUDED).toBe("Packages you've already ordered are included too.");
    expect(copy.cbEnrolledText(1)).toBe("Your package already with us is in your group.");
    expect(copy.cbEnrolledText(2)).toBe("Your 2 packages already with us are in your group.");
    expect(allCopy).not.toMatch(/future packages|from now on only|only new packages/i);
  });
  it("combined-weight freight + group insurance: the FAQ says Yes, with the 0.5 lb example", () => {
    const f = copy.CB_FAQ.find((x) => x.q === "Does Consolidated Billing lower my freight and insurance?")!;
    expect(f.a).toMatch(/^Yes./);
    expect(f.a).toContain("Two 0.5 lb packages are billed as 1 lb, not 2.");
    expect(f.a).toContain("Insurance is charged once on your group's combined declared value");
    expect(f.a).toContain("each package is still covered on its own, up to US$500");
    expect(f.a).toContain("Duty, OPT and VAT stay per package");
  });
  it("never implies the group shares one US$500 cap", () => {
    expect(allCopy).not.toMatch(/(group|combined|shared|total)[^.]{0,30}(cover|cap)[^.]{0,20}US\$500/i);
    expect(allCopy).not.toMatch(/insurance, duty, OPT and VAT stay per package/);
  });
  it("the saving line matches the bill PDF word for word, and is omitted at 0", () => {
    expect(copy.cbSavingLine(1, 2.39, 16.25)).toBe("Saved with Consolidated Billing: US$2.39 (TT$16.25) — 1 lb of freight");
    expect(copy.cbSavingLine(4, 17.57, 119.48, 8)).toBe(
      "Saved with Consolidated Billing: US$17.57 (TT$119.48) — 4 lb of freight + US$8.00 of insurance"
    );
    expect(copy.cbSavingLine(0, 1, 6.8, 1)).toBe("Saved with Consolidated Billing: US$1.00 (TT$6.80) — US$1.00 of insurance");
    expect(copy.cbGroupInsuranceLabel(90)).toBe("Insurance (group, combined value US$90.00)");
    expect(copy.cbSavingLine(0, 0, 0)).toBeNull();
    expect(copy.formatExactLb(0.5)).toBe("0.5 lb");
    expect(copy.formatExactLb(1.25)).toBe("1.25 lb");
    expect(copy.formatExactLb(2)).toBe("2 lb");
  });
  it("HOLD_DAYS is 20", () => expect(copy.HOLD_DAYS).toBe(20));
  it("has the eight FAQ entries", () => expect(copy.CB_FAQ).toHaveLength(8));
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

/**
 * R13a (Brent, 4 Oct 2026): no WHERE (Miami, warehouse, held in…), no WHEN
 * (20 days, Day N of 20, window, lands/arrives) and no HOW (repacking, own box)
 * in ANY customer-facing Consolidated Billing string. Every export of
 * consolidatedBilling.ts is swept — a new string is covered automatically, and a
 * new function fails the "every function is sampled" check until it is added to
 * SAMPLES below.
 *
 * Exceptions (none of these is customer copy that can say where/when):
 *  - HOLD_DAYS is a number used by the window logic (consolidatedBillingCore);
 *    it is never rendered, and the source sweep below keeps it out of the UI.
 *  - cbWaitingSummary is sampled with neutral titles: in the app it prints the
 *    customer's OWN package descriptions, which we don't control.
 */
const R13A_BANNED = /20 days|of 20|miami|warehouse|lands|repack|own box|held in/i;
const R13A_TIMING = /\b\d+ days?\b|\bday \d|\bwindow\b|arriv|as soon as|\bsooner\b|ships? (as|automatically|separately)|\buntil\b/i;

const SAMPLES: Record<string, unknown[][]> = {
  cbEnrolledText: [[1], [3]],
  cbWaitingSummary: [[["Shoes"]], [["Shoes", "Headphones"]], [[]]],
  cbSendNowConfirmText: [[1], [3]],
  cbBillReadyText: [["CB-000001"]],
  swiftCodeFromAc: [["406"]],
  cbWhatsAppUrl: [["SWIFT-0406"]],
  formatExactLb: [[0.5]],
  cbSavingLine: [[4, 17.57, 119.48, 8]],
  cbGroupInsuranceLabel: [[90]],
};

function everyCbString(): { name: string; text: string }[] {
  const out: { name: string; text: string }[] = [];
  for (const [name, value] of Object.entries(copy)) {
    if (typeof value === "string") out.push({ name, text: value });
    else if (typeof value === "function") {
      for (const args of SAMPLES[name] ?? []) {
        const r = (value as (...a: unknown[]) => unknown)(...args);
        if (typeof r === "string") out.push({ name, text: name === "cbWhatsAppUrl" ? decodeURIComponent(r) : r });
      }
    } else if (Array.isArray(value)) {
      for (const item of value) for (const v of Object.values(item as object)) if (typeof v === "string") out.push({ name, text: v });
    }
  }
  return out;
}

describe("R13a: Consolidated Billing copy gives no place, timing or method (4 Oct 2026)", () => {
  it("every exported function is sampled", () => {
    const fns = Object.entries(copy).filter(([, v]) => typeof v === "function").map(([k]) => k);
    expect(fns.filter((k) => !(k in SAMPLES))).toEqual([]);
  });
  it("no exported CB string mentions 20 days / of 20 / Miami / warehouse / lands / repack / own box / held in", () => {
    const hits = everyCbString().filter((s) => R13A_BANNED.test(s.text));
    expect(hits).toEqual([]);
  });
  it("no exported CB string gives shipping or arrival timing", () => {
    const hits = everyCbString().filter((s) => R13A_TIMING.test(s.text));
    expect(hits).toEqual([]);
  });
  it("the approved sentence is the promise, and the FAQ leads with it", () => {
    expect(copy.CB_TOGETHER_LINE).toBe(
      "With Consolidated Billing we consolidate your packages and deliver them together: one delivery, one bill."
    );
    expect(copy.CB_FAQ[0].a.startsWith(copy.CB_TOGETHER_LINE)).toBe(true);
  });
  it("the CB screens never render HOLD_DAYS, a day count or a window date", () => {
    const files = [
      "../components/ConsolidatedBillingCard.tsx",
      "../components/SendMyPackagesNow.tsx",
      "../app/dashboard/packages/[id]/page.tsx",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(__dirname, rel), "utf8");
      // Type fields (`daysLeft: number`, `windowEnd: string`) may stay; reading them into JSX may not.
      const hit = src.match(/HOLD_DAYS|\.daysLeft\b|\.windowEnd\b|open\.day\b|cbOpenCardText|cbShipsAutomaticallyText/)?.[0] ?? null;
      expect({ rel, hit }).toEqual({ rel, hit: null });
    }
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
