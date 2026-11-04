import { describe, expect, it } from "vitest";
import { trackingMatchSql, trackingsMatch } from "./tracking";

/** Admin keeps the full suite (scripts/test-tracking.ts + verify-tracking-dev.ts); this file is code-identical there. */
describe("same parcel: pre-alert number vs the warehouse's USPS barcode", () => {
  it("links Brent's six real pairs, both ways round", () => {
    for (const [a, b] of [
      ["9339589677069924172208", "420330159339589677069924172208"],
      ["9434650105795038940479", "4203301543629434650105795038940479"],
      ["92612903108289553001798060", "4203301592612903108289553001798060"],
      ["92612903108289553001786050", "4203301592612903108289553001786050"],
      ["9361289677069975682235", "420330159361289677069975682235"],
      ["9361289677070017992526", "420330159361289677070017992526"],
    ]) {
      expect(trackingsMatch(a, b)).toBe(true);
      expect(trackingsMatch(b, a)).toBe(true);
    }
  });
  it("never links a different number, a short ending or a blank", () => {
    expect(trackingsMatch("9339589677069924172208", "420330159339589677069924172209")).toBe(false);
    expect(trackingsMatch("123456789012", "999123456789012")).toBe(false);
    expect(trackingsMatch("", "")).toBe(false);
  });
  it("the SQL refuses anything but a column or a :param", () => {
    expect(() => trackingMatchSql("pk.tracking; DROP", ":t")).toThrow();
  });
});
