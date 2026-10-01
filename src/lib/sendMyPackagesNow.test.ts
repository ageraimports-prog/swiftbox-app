import { describe, it, expect } from "vitest";
import * as copy from "./consolidatedBilling";
import { packageBadge, stageMeta } from "./status";

describe('"Send my packages now" (2026-10-01)', () => {
  it("names the group by what the packages are, never by WR/SWF", () => {
    expect(copy.cbWaitingSummary(["Shoes", "Headphones", "Household Items"])).toBe(
      "3 packages waiting: Shoes, Headphones, Household Items"
    );
    expect(copy.cbWaitingSummary(["Shoes"])).toBe("1 package waiting: Shoes");
    expect(copy.cbWaitingSummary(["Shoes", "Headphones"])).not.toMatch(/\bWR\d|\bSWF\d/);
  });
  it("says how long until it ships automatically", () => {
    expect(copy.cbShipsAutomaticallyText(15)).toBe("Ships automatically in 15 days");
    expect(copy.cbShipsAutomaticallyText(2)).toBe("Ships automatically in 2 days");
    expect(copy.cbShipsAutomaticallyText(1)).toBe("Ships automatically after today");
    expect(copy.cbShipsAutomaticallyText(0)).toBe("Ships automatically after today");
  });
  it("confirms in Brent's words before acting", () => {
    expect(copy.cbSendNowConfirmText(3)).toBe(
      "Send these 3 packages now? Anything that arrives after this ships separately, or starts a new group if Consolidated Billing is still on."
    );
    expect(copy.cbSendNowConfirmText(1)).toMatch(/^Send this package now\?/);
    expect(copy.CB_SEND_NOW_BUTTON).toBe("Send my packages now");
  });
  it("R13: nothing here says where a package is", () => {
    const all = [
      copy.CB_PREPARING_TEXT,
      copy.CB_PREPARING_LABEL,
      copy.cbSendNowConfirmText(3),
      copy.cbShipsAutomaticallyText(5),
      copy.cbWaitingSummary(["Shoes"]),
      ...copy.CB_FAQ.flatMap((f) => [f.q, f.a]),
    ].join("\n");
    expect(all).not.toMatch(/trinidad|\bheld\b|holding|landed in|arrived in/i);
    expect(copy.CB_PREPARING_TEXT).toBe("Your packages are being prepared for delivery.");
  });
  it("after the tap the card shows 'being prepared', still never the stage", () => {
    expect(packageBadge(3, true, true).label).toBe("Being prepared for delivery");
    expect(packageBadge(3, true, true).label).not.toBe(stageMeta(3).label);
    expect(packageBadge(3, true, false).label).toBe(copy.CB_WAITING_LABEL);
  });
  it("the FAQ says 20 days is the most, and how to send sooner", () => {
    const a = copy.CB_FAQ.find((f) => f.q === "Can I get my packages sooner?")!.a;
    expect(a).toMatch(/20 days is the most we wait/);
    expect(a).toMatch(/Send my packages now/);
  });
});
