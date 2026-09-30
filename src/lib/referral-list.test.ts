import { describe, expect, it } from "vitest";
import { friendDisplayName, referralStage, referralStageLabel } from "./referral-list";

const base = { packages: 0, delivered: 0, qualified: false, paid: false, decision: null };

describe("referralStage", () => {
  it("a friend with no packages has just signed up", () => {
    expect(referralStage(base)).toBe("signed_up");
  });
  it("any package means the first one is on its way", () => {
    expect(referralStage({ ...base, packages: 1 })).toBe("on_its_way");
  });
  it("paid is earned, whatever else is true", () => {
    expect(referralStage({ ...base, packages: 3, delivered: 1, qualified: true, paid: true })).toBe("earned");
  });
  it("delivered but unpaid is being checked (held for review)", () => {
    expect(referralStage({ ...base, packages: 1, delivered: 1, qualified: true })).toBe("checking");
  });
  it("a rejected review says so", () => {
    expect(referralStage({ ...base, packages: 1, delivered: 1, qualified: true, decision: "rejected" })).toBe("declined");
  });
  it("labels", () => {
    expect(referralStageLabel("earned", 100)).toBe("Delivered — TT$100 earned");
    expect(referralStageLabel("on_its_way", 100)).toBe("First package on its way");
    expect(referralStageLabel("signed_up", 100)).toBe("Signed up");
  });
});

describe("friendDisplayName — first name and last initial only", () => {
  it("normal", () => expect(friendDisplayName("kezia", "BAPTISTE")).toBe("Kezia B."));
  it("whole name in fname", () => expect(friendDisplayName("Kezia Baptiste", "")).toBe("Kezia B."));
  it("no surname", () => expect(friendDisplayName("Ravi", null)).toBe("Ravi"));
  it("nothing usable", () => expect(friendDisplayName("", "")).toBe("A friend"));
  it("never shows the full surname", () => expect(friendDisplayName("Ann", "Mohammed-Ali")).not.toContain("Mohammed"));
  it("an email in the name field is not shown", () => expect(friendDisplayName("x@y.com", "Smith")).toBe("A friend"));
});
