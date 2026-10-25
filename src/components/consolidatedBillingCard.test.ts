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
