import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import ConsolidatedBillingCard from "./ConsolidatedBillingCard";
import { TOBAGO_DELIVERY_SHORT, TOBAGO_DELIVERY_LONG, TOBAGO_DELIVERY_FAQ_Q } from "@/lib/tobago-delivery";

const base = {
  settingOn: false,
  eligible: true,
  swiftCode: "SWIFT-0364",
  open: null,
  closedWaiting: false,
  group: null,
  preparing: false,
  billReady: null,
};

// The markup escapes apostrophes etc.; the Tobago lines have none, but "&" etc. would be escaped too.
const render = (state: Record<string, unknown>, showFaq = false) =>
  renderToStaticMarkup(React.createElement(ConsolidatedBillingCard, { showFaq, initialState: state as never }));

describe("ConsolidatedBillingCard — Tobago delivery line (Brent, 25 Oct 2026)", () => {
  it("shows the short wording to a Tobago customer, switch off or on", () => {
    expect(render({ ...base, tobago: true })).toContain(TOBAGO_DELIVERY_SHORT);
    expect(render({ ...base, settingOn: true, tobago: true })).toContain(TOBAGO_DELIVERY_SHORT);
  });
  it("never shows it to a Trinidad customer (or when the flag is missing)", () => {
    for (const s of [{ ...base, tobago: false }, base, { ...base, settingOn: true, tobago: false }]) {
      const html = render(s, true);
      expect(html).not.toMatch(/Tobago|TT\$30/);
    }
  });
  it("adds the long wording to the questions for a Tobago customer only", () => {
    const tobago = render({ ...base, tobago: true }, true);
    expect(tobago).toContain(TOBAGO_DELIVERY_FAQ_Q);
    expect(tobago).toContain(TOBAGO_DELIVERY_LONG);
    expect(render({ ...base, tobago: true }, false)).not.toContain(TOBAGO_DELIVERY_LONG);
  });
});

describe("ConsolidatedBillingCard — on the Dashboard (Brent, 13 Nov 2026)", () => {
  const dash = (state: Record<string, unknown>) =>
    renderToStaticMarkup(React.createElement(ConsolidatedBillingCard, { dashboard: true, showFaq: true, showSendNow: true, initialState: state as never }));
  it("never used: the pitch and the more-than-one-package line, the switch, no counter", () => {
    const html = dash({ ...base, savingsTtd: 0 });
    expect(html).toContain("Ordering more than one thing? Consolidate and save");
    expect(html).toContain("expecting more than one package");
    expect(html).toContain('role="switch"');
    expect(html).not.toContain("saved TT$");
  });
  it("used before, nothing open: the lifetime saving first, with the switch", () => {
    const html = dash({ ...base, savingsTtd: 123.4 });
    expect(html).toContain("TT$123.40");
    expect(html.indexOf("TT$123.40")).toBeLessThan(html.indexOf('role="switch"'));
    expect(html).not.toContain("Ordering more than one thing");
  });
  it("on: the usual wording, the counter only above zero", () => {
    expect(dash({ ...base, settingOn: true, savingsTtd: 50 })).toContain("You&#x27;ve saved TT$50.00 with Consolidated Billing");
    expect(dash({ ...base, settingOn: true, savingsTtd: 0 })).not.toContain("saved TT$");
    expect(dash({ ...base, settingOn: true, savingsTtd: null })).not.toContain("saved TT$");
  });
  it("an anchor for the Account link, and the questions folded away", () => {
    const html = dash(base);
    expect(html).toContain('id="consolidated-billing"');
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Questions<\/summary>/);
  });
  it("Account's card (not dashboard) is unchanged: no pitch, no counter", () => {
    const html = render({ ...base, savingsTtd: 99 }, true);
    expect(html).not.toContain("Ordering more than one thing");
    expect(html).not.toContain("saved TT$");
  });
});
