import { describe, expect, it } from "vitest";
import {
  detectCarrier,
  displayTitle,
  formatTracking,
  packageIdentity,
  packagesSummary,
  shortRef,
  splitTracking,
  trackingNumbers,
} from "./packageDisplay";

// Synthetic numbers with valid check digits (UPS is its own published sample).
const UPS = "1Z999AA10123456784";
const USPS22 = "9400111899223197428497";
const USPS26 = "92612901001304350824651237";
const FEDEX12 = "398845130239";
const FEDEX15 = "123456789012343";

describe("detectCarrier", () => {
  it("labels each carrier only when the check digit agrees", () => {
    expect(detectCarrier(UPS)).toBe("UPS");
    expect(detectCarrier("1Z999AA10123456785")).toBeNull();
    expect(detectCarrier(USPS22)).toBe("USPS");
    expect(detectCarrier(USPS26)).toBe("USPS");
    expect(detectCarrier("9400111899223197428490")).toBeNull();
    expect(detectCarrier(FEDEX12)).toBe("FedEx");
    expect(detectCarrier("398845130238")).toBeNull();
    expect(detectCarrier(FEDEX15)).toBe("FedEx");
    expect(detectCarrier("TBA123456789012")).toBe("Amazon");
  });

  it("is case- and space-insensitive", () => {
    expect(detectCarrier("1z 999 aa1 01 2345 6784")).toBe("UPS");
    expect(detectCarrier(" tba123456789012 ")).toBe("Amazon");
  });

  it("never labels the Play demo numbers, notes or unknown formats", () => {
    for (const t of ["DEMO0364001", "DEMO0364002", "DEMO0364003", "DELIVERED", "", null, undefined,
      "GFUS01234567890123", "SPXMIA0123456789", "D10012345678901", "12345", "9612345678901234567890"]) {
      expect(detectCarrier(t)).toBeNull();
    }
  });

  it("does not call a 96… number USPS", () => {
    expect(detectCarrier("9612019000000000000000")).toBeNull();
  });
});

describe("trackingNumbers", () => {
  it("unwraps a FedEx 34-digit label barcode to the 12-digit number", () => {
    const barcode = "96" + "32001960000000000400" + FEDEX12;
    expect(barcode).toHaveLength(34);
    expect(trackingNumbers(barcode)).toEqual([{ number: FEDEX12, carrier: "FedEx" }]);
  });

  it("unwraps USPS 420+ZIP barcodes (5- and 9-digit ZIP)", () => {
    expect(trackingNumbers("42033166" + USPS22)).toEqual([{ number: USPS22, carrier: "USPS" }]);
    expect(trackingNumbers("420331661234" + USPS22)).toEqual([{ number: USPS22, carrier: "USPS" }]);
    expect(trackingNumbers("42033166" + USPS26)).toEqual([{ number: USPS26, carrier: "USPS" }]);
  });

  it("leaves a barcode it can't verify exactly as stored", () => {
    const bad = "96" + "32001960000000000400" + "398845130238";
    expect(trackingNumbers(bad)).toEqual([{ number: bad, carrier: null }]);
  });

  it("splits several numbers in one field and drops notes", () => {
    expect(splitTracking(`tba123456789012, TBA123456789013 / ${UPS}`)).toEqual([
      "TBA123456789012",
      "TBA123456789013",
      UPS,
    ]);
    expect(splitTracking("DELIVERED BY HAYDEN")).toEqual([]);
    expect(splitTracking("n/a")).toEqual([]);
    expect(splitTracking("TBA123456789012,TBA123456789012")).toEqual(["TBA123456789012"]);
  });
});

describe("formatTracking", () => {
  it("keeps numbers up to 22 characters whole", () => {
    expect(formatTracking(UPS)).toBe(UPS);
    expect(formatTracking(USPS22)).toBe(USPS22);
  });

  it("truncates longer ones in the middle", () => {
    expect(formatTracking(USPS26)).toBe("92612901…651237");
    expect(formatTracking(USPS26)).toHaveLength(15);
    expect(formatTracking(UPS, 14, 8, 4)).toBe("1Z999AA1…6784");
  });
});

describe("displayTitle", () => {
  it("title-cases ALL-CAPS and all-lower descriptions", () => {
    expect(displayTitle("PARTY SUPPLY")).toBe("Party Supply");
    expect(displayTitle("toy")).toBe("Toy");
    expect(displayTitle("SHOES, WEARING APPAREL")).toBe("Shoes, Wearing Apparel");
    expect(displayTitle("E-CIGARETTES")).toBe("E-Cigarettes");
    expect(displayTitle("CLOTHING ")).toBe("Clothing");
    expect(displayTitle("BAGS AND SHOES FOR THE HOME")).toBe("Bags and Shoes for the Home");
  });

  it("keeps acronyms and model codes upper-case", () => {
    expect(displayTitle("USB CABLE")).toBe("USB Cable");
    expect(displayTitle("GGTEX59 EXTENSION KIT")).toBe("GGTEX59 Extension Kit");
    expect(displayTitle("LED TV")).toBe("LED TV");
  });

  it("leaves mixed-case text as typed", () => {
    expect(displayTitle("iPhone case")).toBe("iPhone case");
  });

  it("is null for nothing", () => {
    for (const s of ["", "   ", null, undefined, "N/A", "-", "x"]) expect(displayTitle(s)).toBeNull();
  });
});

describe("packageIdentity", () => {
  it("leads with the description and the tracking number", () => {
    expect(packageIdentity({ commodities: "PARTY SUPPLY", tracking: UPS, wr: "WR1193" })).toEqual({
      title: "Party Supply",
      tracking: { number: UPS, carrier: "UPS" },
      moreTracking: 0,
      ref: "WR1193",
    });
  });

  it("falls back to 'Package' with no description, and to no tracking line with none", () => {
    const noDesc = packageIdentity({ commodities: "", tracking: "DEMO0364001", wr: "WR0999" });
    expect(noDesc.title).toBe("Package");
    expect(noDesc.tracking).toEqual({ number: "DEMO0364001", carrier: null });
    const noTrk = packageIdentity({ commodities: "BOOK", tracking: "", wr: "WR0998" });
    expect(noTrk.tracking).toBeNull();
    expect(noTrk.ref).toBe("WR0998");
  });

  it("uses a caller's fallback title and counts extra numbers", () => {
    const p = packageIdentity({ tracking: "TBA123456789012, TBA123456789013", fallbackTitle: "Amazon" });
    expect(p.title).toBe("Amazon");
    expect(p.moreTracking).toBe(1);
  });
});

describe("shortRef / packagesSummary", () => {
  it("prefers the Airdrop code", () => {
    expect(shortRef("WR1193", "SWF000009")).toBe("SWF000009");
    expect(shortRef("WR1193", null)).toBe("WR1193");
    expect(shortRef(null, null)).toBe("");
  });

  it("summarises several packages", () => {
    expect(packagesSummary([])).toBe("");
    expect(packagesSummary(["Shoes"])).toBe("Shoes");
    expect(packagesSummary(["Shoes", "Book", "Toy"])).toBe("Shoes + 2 more");
  });
});
