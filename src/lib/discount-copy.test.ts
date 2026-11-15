import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Customer copy rules for the online-payment discount and "Your savings" (admin
 * CARD_DISCOUNT_PLAN.md, Brent 2026-11-15): never PayPal's fees, the exchange-rate
 * cap or how tiers are worked out; never how many packages a customer has; never
 * where Consolidated Billing packages are or when they move.
 */
const FILES = ["src/components/YourSavingsCard.tsx", "src/components/PayAllCard.tsx", "src/app/pay/paypal/PayPalOutcome.tsx"];

/** The text a customer can see: JSX text and string literals, comments removed. */
function visibleText(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/className=(\{`[^`]*`\}|"[^"]*")/g, "");
}

describe("discount + savings copy", () => {
  for (const f of FILES) {
    const text = visibleText(readFileSync(f, "utf8"));
    it(`${f}: no fee, cap, tier or rate-guard wording`, () => {
      expect(text).not.toMatch(/paypal fee|processing fee|\bcap\b|\btiers?\b|per US\$1 kept|exchange-rate/i);
    });
    it(`${f}: no package counts`, () => {
      expect(text).not.toMatch(/\{[^}]*\.count[^}]*\}\s*(packages?|invoices?)/i);
      expect(text).not.toMatch(/packages? (outstanding|waiting|left)/i);
    });
    it(`${f}: no Consolidated Billing place or timing`, () => {
      expect(text).not.toMatch(/\b(Miami|Trinidad|Piarco|warehouse|in transit|held)\b/i);
    });
  }

  it("PayNow's discount lines say what is saved, nothing about how", () => {
    const src = visibleText(readFileSync("src/app/dashboard/invoices/[invoiceNo]/PayNow.tsx", "utf8"));
    expect(src).toMatch(/Pay online now and save/);
    expect(src).toMatch(/Pay all together and save/);
    expect(src).not.toMatch(/\bcap\b|\btiers?\b|per US\$1 kept/i);
  });
});
