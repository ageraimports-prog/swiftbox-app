import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSendNowRequest, SEND_NOW_UNCONFIRMED } from "./send-now-request";
import * as copy from "./consolidatedBilling";
import { packageBadge, stageMeta } from "./status";
import { customerFacingView } from "./customer-facing-status-core";

describe('"Send my packages now" (2026-10-01)', () => {
  it("names the group by what the packages are, never by WR/SWF", () => {
    expect(copy.cbWaitingSummary(["Shoes", "Headphones", "Household Items"])).toBe(
      "Your group: Shoes, Headphones, Household Items"
    );
    expect(copy.cbWaitingSummary(["Shoes"])).toBe("Your group: Shoes");
    expect(copy.cbWaitingSummary(["Shoes", "Headphones"])).not.toMatch(/\bWR\d|\bSWF\d/);
  });
  it("R13a: the hint under the list gives no timing (was 'Ships automatically in N days')", () => {
    expect(copy.CB_SEND_NOW_HINT).toBe("Got everything you ordered? Tap Send my packages now and we'll deliver them together.");
    expect((copy as Record<string, unknown>).cbShipsAutomaticallyText).toBeUndefined();
  });
  it("confirms the settled switch-off rule without counts", () => {
    expect(copy.cbSendNowConfirmText(3)).toBe("This sends your current group together and switches Consolidated Billing off. Turn it back on anytime. Continue?");
    expect(copy.cbSendNowConfirmText(1)).toBe(copy.cbSendNowConfirmText(11));
    expect(copy.CB_SEND_NOW_DONE).toContain("Consolidated Billing is now off");
    expect(copy.CB_SEND_NOW_DONE).not.toMatch(/\d|count|outstanding|hold|warehouse/i);
  });
  it("the server refuses a send that did not come through the confirmation", () => {
    expect(parseSendNowRequest({ groupId: 7, confirmed: true })).toEqual({ ok: true, groupId: 7 });
    for (const body of [{ groupId: 7 }, { groupId: 7, confirmed: "true" }, { groupId: 7, confirmed: 1 }, { groupId: 7, confirmed: false }]) {
      expect(parseSendNowRequest(body)).toEqual({ ok: false, error: SEND_NOW_UNCONFIRMED });
    }
    expect(parseSendNowRequest({ confirmed: true }).ok).toBe(false);
    expect(parseSendNowRequest(null).ok).toBe(false);
  });
  it("the button only opens the confirmation; only its Yes sends, and the route checks it", () => {
    const panel = readFileSync(join(__dirname, "..", "components", "SendMyPackagesNow.tsx"), "utf8");
    expect(panel).toMatch(/onClick=\{\(\) => setStep\("confirm"\)\}/);
    expect(panel.match(/onClick=\{send\}/g)?.length).toBe(1);
    expect(panel).toMatch(/confirmed: true/);
    const route = readFileSync(join(__dirname, "..", "app", "api", "consolidated-billing", "release", "route.ts"), "utf8");
    expect(route).toMatch(/parseSendNowRequest\(body\)/);
    // Every other screen that offers the button uses this one panel.
    const card = readFileSync(join(__dirname, "..", "components", "ConsolidatedBillingCard.tsx"), "utf8");
    expect(card).toMatch(/<SendNowPanel/);
    expect(card).not.toMatch(/consolidated-billing\/release/);
  });
  it("R13: nothing here says where a package is", () => {
    const all = [
      copy.CB_PREPARING_TEXT,
      copy.cbSendNowConfirmText(3),
      copy.CB_SEND_NOW_HINT,
      copy.cbWaitingSummary(["Shoes"]),
      ...copy.CB_FAQ.flatMap((f) => [f.q, f.a]),
    ].join("\n");
    expect(all).not.toMatch(/trinidad|\bheld\b|holding|landed in|arrived in/i);
    expect(copy.CB_PREPARING_TEXT).toBe("Your packages are being prepared for delivery.");
  });
  it("after the tap the packages still read Consolidating, never the stage (2026-10-13)", () => {
    const closedByCustomer = { state: "closed", billId: null, billLifecycle: null, offBillReason: null };
    const v = customerFacingView({ shipStatus: 3, cb: closedByCustomer });
    expect(packageBadge(v).label).toBe(copy.CB_WAITING_LABEL);
    expect(packageBadge(v).label).not.toBe(stageMeta(3).label);
  });
  it("the FAQ explains Send my packages now without timing (R13a)", () => {
    const a = copy.CB_FAQ.find((f) => f.q === "What does “Send my packages now” do?")!.a;
    expect(a).toMatch(/Send my packages now/);
    expect(a).toMatch(/deliver them together/);
    expect(a).not.toMatch(/\b\d+ days?\b|sooner|as soon as/i);
  });
});
