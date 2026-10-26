import { describe, expect, it } from "vitest";
import { addressLine2, miamiAddressFields, miamiAddressText } from "./miami-address";

// Checkout-form order (Brent, 2026-10-26): Address line 1 = the street,
// Address line 2 = UNIT G36 SWIFT-####. Same seven as SwiftboxAdmin
// (customerAddressFields) and the website (miamiAddressFields).
describe("Miami address as checkout fields", () => {
  it("gives the seven fields, labelled, in form order", () => {
    expect(miamiAddressFields("Anika Ramlal", "\t18")).toEqual([
      ["Full name", "Anika Ramlal"],
      ["Address line 1", "6175 NW 167th ST STE G36"],
      ["Address line 2", "UNIT G36 SWIFT-0018"],
      ["City", "Hialeah"],
      ["State", "FL"],
      ["ZIP", "33015"],
      ["Country", "United States"],
    ]);
  });

  it("pads the SWIFT code the way the website does", () => {
    expect(addressLine2("18")).toBe("UNIT G36 SWIFT-0018");
    expect(addressLine2("\t33843")).toBe("UNIT G36 SWIFT-33843");
  });

  it("copies one labelled field per line; ZIP never ZIP+4", () => {
    const text = miamiAddressText("Anika Ramlal", "848");
    expect(text.split("\n")).toEqual([
      "Full name: Anika Ramlal",
      "Address line 1: 6175 NW 167th ST STE G36",
      "Address line 2: UNIT G36 SWIFT-0848",
      "City: Hialeah",
      "State: FL",
      "ZIP: 33015",
      "Country: United States",
    ]);
    expect(text).not.toMatch(/33015-\d{4}/);
  });

  it("a blank name still gives a Full name field", () => {
    expect(miamiAddressFields("  ", "7")[0]).toEqual(["Full name", "Your full name"]);
  });
});
