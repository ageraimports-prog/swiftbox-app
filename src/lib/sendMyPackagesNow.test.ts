import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseSendNowRequest, SEND_NOW_UNCONFIRMED } from "./send-now-request";
import * as copy from "./consolidatedBilling";
import { packageBadge, stageMeta } from "./status";
import { customerFacingView } from "./customer-facing-status-core";
import { offersSendNow, isPreparingGroup, isClosedWaitingGroup, type CbGroupFacts } from "./consolidatedBillingCore";

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
  it("confirms what really happens before acting (2026-10-18: arrived ones together, the rest on their own)", () => {
    expect(copy.cbSendNowConfirmText(3)).toBe(
      "This closes your current group. Packages that have already arrived will be billed together now. Any still on the way will be billed and delivered on their own when they arrive. New packages you receive will start a new group. Continue?"
    );
    // It never promises that every package goes together any more.
    for (const n of [1, 3, 11]) expect(copy.cbSendNowConfirmText(n)).not.toMatch(/These \d+ packages|This 1 package/);
    expect(copy.CB_SEND_NOW_YES).toBe("Yes, send these now");
    expect(copy.CB_SEND_NOW_NO).toBe("Keep waiting");
    expect(copy.CB_SEND_NOW_BUTTON).toBe("Send my packages now");
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

describe('"Send my packages now" beats "Keep together" (Brent, 2026-10-18)', () => {
  const open: CbGroupFacts = { state: "open", closeReason: null, keptTogether: false };
  const kept: CbGroupFacts = { state: "closed", closeReason: "window_ended", keptTogether: true };
  const keptAfterSendNow: CbGroupFacts = { state: "closed", closeReason: "customer", keptTogether: true };
  const ordinaryClosed: CbGroupFacts = { state: "closed", closeReason: "window_ended", keptTogether: false };
  const preparing: CbGroupFacts = { state: "closed", closeReason: "customer", keptTogether: false };
  const released: CbGroupFacts = { state: "released", closeReason: "customer", keptTogether: false };

  it("an OPEN group shows the button", () => {
    expect(offersSendNow(open)).toBe(true);
  });
  it("a Keep-together group shows the button (whatever closed it first)", () => {
    expect(offersSendNow(kept)).toBe(true);
    expect(offersSendNow(keptAfterSendNow)).toBe(true);
  });
  it("an ordinary closed group (window ended, waiting) does NOT", () => {
    expect(offersSendNow(ordinaryClosed)).toBe(false);
  });
  it("a group the customer already sent (\"preparing\") does NOT, nor a released one", () => {
    expect(offersSendNow(preparing)).toBe(false);
    expect(offersSendNow(released)).toBe(false);
  });
  it("a Keep group keeps the waiting card, never the 'being prepared' line", () => {
    for (const g of [kept, keptAfterSendNow]) {
      expect(isClosedWaitingGroup(g)).toBe(true);
      expect(isPreparingGroup(g)).toBe(false);
    }
    expect(isPreparingGroup(preparing)).toBe(true);
    expect(isClosedWaitingGroup(preparing)).toBe(false);
    expect(isClosedWaitingGroup(ordinaryClosed)).toBe(true);
    expect(isClosedWaitingGroup(open)).toBe(false);
  });
  it("the same confirmation as an open group: arrived ones together, the rest on their own", () => {
    expect(copy.cbSendNowConfirmText(2)).toMatch(/already arrived will be billed together now/);
    expect(copy.cbSendNowConfirmText(2)).toMatch(/billed and delivered on their own/);
  });
  it("both readers and both screens use the one rule; no day count reaches a Keep group", () => {
    const lib = readFileSync(join(__dirname, "consolidated-billing.ts"), "utf8");
    expect(lib.match(/keptTogetherSql\("g"\)/g)?.length).toBe(2); // getCbState + cbPackageFacts
    expect(lib).toMatch(/if \(!offersSendNow\(g\.facts\)\) continue;/);
    expect(lib).toMatch(/sendNowOffered: offersSendNow\(facts\)/);
    expect(lib).toMatch(/daysLeft: isOpen && ends \?/);
    expect(lib).not.toMatch(/inOpenGroup/);
    const page = readFileSync(join(__dirname, "..", "app", "dashboard", "packages", "[id]", "page.tsx"), "utf8");
    expect(page).toMatch(/data\.cbSendNowOffered && <SendMyPackagesNow \/>/);
    for (const file of ["SendMyPackagesNow.tsx", "ConsolidatedBillingCard.tsx"]) {
      const src = readFileSync(join(__dirname, "..", "components", file), "utf8");
      expect(src).toMatch(/sendGroups/);
      expect(src).not.toMatch(/state\.group\b/);
      expect(src).not.toMatch(/daysLeft\}/); // never rendered (R13a)
    }
  });
});
