import { describe, it, expect } from "vitest";
import * as copy from "./consolidatedBilling";
import { packageBadge, stageMeta } from "./status";

describe('"Send my packages now" (2026-10-01)', () => {
  it("names the group by what the packages are, never by WR/SWF", () => {
    expect(copy.cbWaitingSummary(["Shoes", "Headphones", "Household Items"])).toBe(
      "3 packages in your group: Shoes, Headphones, Household Items"
    );
    expect(copy.cbWaitingSummary(["Shoes"])).toBe("1 package in your group: Shoes");
    expect(copy.cbWaitingSummary(["Shoes", "Headphones"])).not.toMatch(/\bWR\d|\bSWF\d/);
  });
  it("R13a: the hint under the list gives no timing (was 'Ships automatically in N days')", () => {
    expect(copy.CB_SEND_NOW_HINT).toBe("Got everything you ordered? Tap Send my packages now and we'll deliver them together.");
    expect((copy as Record<string, unknown>).cbShipsAutomaticallyText).toBeUndefined();
  });
  it("confirms in Brent's words before acting", () => {
    expect(copy.cbSendNowConfirmText(3)).toBe(
      "Send these 3 packages now? We'll deliver them together, with one bill. Any other packages come separately, or start a new group if Consolidated Billing is still on."
    );
    expect(copy.cbSendNowConfirmText(1)).toMatch(/^Send this package now\?/);
    expect(copy.CB_SEND_NOW_BUTTON).toBe("Send my packages now");
  });
  it("R13: nothing here says where a package is", () => {
    const all = [
      copy.CB_PREPARING_TEXT,
      copy.CB_PREPARING_LABEL,
      copy.cbSendNowConfirmText(3),
      copy.CB_SEND_NOW_HINT,
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
  it("the FAQ explains Send my packages now without timing (R13a)", () => {
    const a = copy.CB_FAQ.find((f) => f.q === "What does “Send my packages now” do?")!.a;
    expect(a).toMatch(/Send my packages now/);
    expect(a).toMatch(/deliver them together/);
    expect(a).not.toMatch(/\b\d+ days?\b|sooner|as soon as/i);
  });
});
