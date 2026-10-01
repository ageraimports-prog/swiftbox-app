import { describe, expect, it } from "vitest";
import { BFM_EVENT_DEFS } from "./buy-for-me-core";
import {
  allInFromRow,
  allInNotice,
  amountDueTtdCents,
  bfmEventTitle,
  formatPct,
  parseFeePct,
  UNKNOWN_EVENT_TITLE,
} from "./buy-for-me-quote";

/* The app only DISPLAYS stored quote figures. These pin how a row is read:
   all-in when grand_total_ttd is set, purchase-only otherwise — including a row
   from before migration 043, where the columns are simply absent. */

const purchaseOnly = {
  id: 7, request_id: 12, seq: 0, kind: "original", status: "awaiting_payment", fee_pct: "15.0000", roe: "6.8000",
  item_value_usd: "100.00", us_tax_usd: "7.00", us_shipping_usd: "5.99", fee_usd: "15.00", total_usd: "127.99",
  item_value_ttd: "680.00", us_tax_ttd: "47.60", us_shipping_ttd: "40.73", fee_ttd: "102.00", total_ttd: "870.33",
};

const allIn = {
  ...purchaseOnly,
  est_weight_lb: "3.50",
  courier_roe: "6.7800",
  freight_usd: "6.97",
  fuel_usd: "1.05",
  insurance_usd: "2.50",
  courier_ttd: "71.33",
  duty_ttd: "40.10",
  opt_ttd: "0.00",
  vat_ttd: "125.40",
  other_ttd: "0.00",
  customs_ttd: "165.50",
  grand_total_ttd: "1107.16",
};

describe("reading a stored quote", () => {
  it("a row from before migration 043 (columns absent) is purchase-only and pays total_ttd", () => {
    expect(allInFromRow(purchaseOnly)).toBeNull();
    expect(amountDueTtdCents(purchaseOnly)).toBe(87033);
  });

  it("NULL grand_total_ttd (043 ran, purchase-only quote) pays total_ttd", () => {
    const row = { ...purchaseOnly, grand_total_ttd: null, courier_ttd: null, est_weight_lb: null };
    expect(allInFromRow(row)).toBeNull();
    expect(amountDueTtdCents(row)).toBe(87033);
  });

  it("an all-in quote pays grand_total_ttd and its TTD column adds up", () => {
    const a = allInFromRow(allIn)!;
    expect(a).not.toBeNull();
    expect(amountDueTtdCents(allIn)).toBe(110716);
    expect(a.grandTotalTtdCents).toBe(110716);
    expect(a.courierTtdCents).toBe(7133);
    expect(a.freightUsdCents + a.fuelUsdCents + a.insuranceUsdCents).toBe(1052);
    expect(a.estWeightLb).toBe(3.5);
    // grand = purchase total + courier + customs, and customs = duty + OPT + VAT + other
    expect(87033 + a.courierTtdCents + a.customsTtdCents).toBe(a.grandTotalTtdCents);
    expect(a.dutyTtdCents + a.optTtdCents + a.vatTtdCents + a.otherTtdCents).toBe(a.customsTtdCents);
  });

  it("a top-up row is read the same way, with its own figures", () => {
    const topup = { ...allIn, seq: 1, kind: "topup", total_ttd: "102.00", courier_ttd: "10.00", customs_ttd: "5.00", grand_total_ttd: "117.00" };
    expect(amountDueTtdCents(topup)).toBe(11700);
  });
});

describe("the all-in wording", () => {
  it("names the estimated weight", () => {
    expect(allInNotice(3.5)).toBe(
      "This price includes delivery to Trinidad, duty and VAT, based on an estimated weight of 3.5 lb. If the actual weight or the customs assessment is higher, the difference may be charged on delivery."
    );
    expect(allInNotice(12)).toContain("estimated weight of 12 lb.");
  });
  it("still reads as a sentence when no weight was stored", () => {
    expect(allInNotice(null)).toBe(
      "This price includes delivery to Trinidad, duty and VAT. If the actual weight or the customs assessment is higher, the difference may be charged on delivery."
    );
  });
});

describe("the fee setting in copy", () => {
  it("reads bfm_fee_pct and falls back to 15", () => {
    expect(parseFeePct("15.0000")).toBe(15);
    expect(parseFeePct("12.5")).toBe(12.5);
    expect(parseFeePct(null)).toBe(15);
    expect(parseFeePct(undefined)).toBe(15);
    expect(parseFeePct("abc")).toBe(15);
    expect(parseFeePct("80")).toBe(15);
    expect(formatPct(15)).toBe("15");
    expect(formatPct(12.5)).toBe("12.5");
  });
});

describe("history titles", () => {
  const base = BFM_EVENT_DEFS as Record<string, { title: string }>;
  it("keeps every existing kind's title", () => {
    for (const [k, v] of Object.entries(base)) expect(bfmEventTitle(k, base)).toBe(v.title);
  });
  it("names the two all-in arrival events", () => {
    expect(bfmEventTitle("landed_invoiced", base)).toBe("Arrived — delivery already paid");
    expect(bfmEventTitle("extra_charges", base)).toBe("Additional charges on arrival");
  });
  it("never shows a raw code for a kind it doesn't know", () => {
    expect(bfmEventTitle("some_future_kind", base)).toBe(UNKNOWN_EVENT_TITLE);
    expect(bfmEventTitle(null, base)).toBe(UNKNOWN_EVENT_TITLE);
    expect(bfmEventTitle("__proto__", base)).toBe(UNKNOWN_EVENT_TITLE);
  });
});
