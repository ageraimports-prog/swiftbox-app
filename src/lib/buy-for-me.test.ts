import { describe, expect, it } from "vitest";
import {
  BFM_STATUSES,
  BFM_STATUS_LABEL,
  cleanText,
  computeOriginalQuote,
  fitsUtf8mb3,
  parseMoneyInput,
  paymentRef,
  requestNo,
  safeProductUrl,
} from "./buy-for-me-core";
import { detectSlipType, randomSlipName, slipPath, SLIP_MAX_BYTES, SLIP_PATH_RE } from "./slip-file";
import { safeNext } from "./next-path";
import { paymentLabel } from "./payment-label";

/* buy-for-me-core.ts is an IDENTICAL copy of SwiftboxAdmin/lib/buy-for-me-core.ts
   (tested in full there by scripts/test-buy-for-me-core.ts). These re-run the
   parts this app relies on, so a drifted copy fails here too. */

describe("4-byte characters never reach a utf8 column", () => {
  it("strips emoji, keeps accents and €", () => {
    expect(cleanText("Blue 😀 size M", 100)).toBe("Blue  size M");
    expect(cleanText("🇹🇹 gift 👨‍👩‍👧 x", 100)).toBe("gift  x");
    expect(cleanText("Café € — naïve", 100)).toBe("Café € — naïve");
    expect(cleanText("a\uD83Db", 100)).toBe("ab");
    expect(cleanText("😀😀abc", 3)).toBe("abc");
    expect(fitsUtf8mb3(cleanText("🎉 ".repeat(300) + "ok 🚀", 500))).toBe(true);
  });
});

describe("product links", () => {
  it("only http(s) is ever clickable", () => {
    expect(safeProductUrl("https://www.amazon.com/dp/B0ABC")).toBe("https://www.amazon.com/dp/B0ABC");
    expect(safeProductUrl("javascript:alert(1)")).toBeNull();
    expect(safeProductUrl("data:text/html,<b>x</b>")).toBeNull();
    expect(safeProductUrl("the red one")).toBeNull();
  });
});

describe("money input and the shared calculator", () => {
  it("parses what customers type, refuses garbage", () => {
    expect(parseMoneyInput("$24.99")).toEqual({ ok: true, cents: 2499 });
    expect(parseMoneyInput("abc").ok).toBe(false);
    expect(parseMoneyInput("-5").ok).toBe(false);
  });
  it("gives the admin's figures for the worked sample (fee on item value only)", () => {
    const q = computeOriginalQuote(
      [
        { qty: 2, unitPriceCents: 2499, usTaxCents: 350, usShippingCents: 599 },
        { qty: 1, unitPriceCents: 6000, usTaxCents: 420, usShippingCents: 0 },
      ],
      15,
      6.8
    );
    expect(q.usd.total).toBe(14017);
    expect(q.usd.fee).toBe(1650);
    expect(q.ttd.total).toBe(95315);
  });
  it("references and labels", () => {
    expect(requestNo(12)).toBe("BFM-00012");
    expect(paymentRef(12, 1)).toBe("BFM-00012-T1");
    for (const s of BFM_STATUSES) expect(BFM_STATUS_LABEL[s].customer.length).toBeGreaterThan(0);
  });
});

describe("payment slips: type by first bytes, private unguessable names", () => {
  const pad = (b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  it("accepts JPEG, PNG, WebP and PDF by their bytes", () => {
    expect(detectSlipType(pad([0xff, 0xd8, 0xff, 0xe0]))?.contentType).toBe("image/jpeg");
    expect(detectSlipType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.contentType).toBe("image/png");
    expect(detectSlipType(pad([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]))?.contentType).toBe("image/webp");
    expect(detectSlipType(pad([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))?.contentType).toBe("application/pdf");
  });
  it("refuses anything else, whatever it is called", () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    const exe = pad([0x4d, 0x5a, 0x90, 0x00]);
    expect(detectSlipType(html)).toBeNull();
    expect(detectSlipType(exe)).toBeNull();
    expect(detectSlipType(new Uint8Array([0xff, 0xd8]))).toBeNull(); // too short
  });
  it("names are 32 random hex characters and never repeat", () => {
    const a = randomSlipName();
    const b = randomSlipName();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toBe(b);
    expect(slipPath(12, a, "jpg")).toMatch(SLIP_PATH_RE);
    expect(slipPath(12, a, "jpg")).not.toContain("slip.jpg");
  });
  it("the limit fits under Vercel's 4.5 MB request cap", () => {
    expect(SLIP_MAX_BYTES).toBeLessThan(4.5 * 1024 * 1024);
  });
});

describe("login return path", () => {
  it("returns to Buy For Me after logging in", () => {
    expect(safeNext("/dashboard/buy-for-me")).toBe("/dashboard/buy-for-me");
    expect(safeNext("%2Fdashboard%2Fbuy-for-me%2F12")).toBe("/dashboard/buy-for-me/12");
    expect(safeNext("/account")).toBe("/account");
  });
  it("never sends anyone to another site", () => {
    for (const bad of ["https://evil.com", "//evil.com/dashboard", "/\\evil.com", "javascript:alert(1)", "/login", "/api/logout", "", null, "dashboard"]) {
      expect(safeNext(bad as string | null)).toBeNull();
    }
  });
});

describe("payment labels", () => {
  it("never shows a raw stored value", () => {
    expect(paymentLabel("bfm_credit")).toBe("Buy For Me credit");
    expect(paymentLabel("linx")).toBe("LINX");
    expect(paymentLabel("something_new")).toBe("Payment");
  });
});
