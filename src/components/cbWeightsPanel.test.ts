import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { CbWeightsPanel, cbWeightsPanelView } from "./CbWeightsPanel";

const render = (weights: unknown) => renderToStaticMarkup(React.createElement(CbWeightsPanel, { weights }));

// CB-000006 (INV-000127): 15.5 lb exact → billed 16 lb; 18 lb if each package were billed alone.
const full = {
  ready: true,
  allExact: true,
  packages: [{ pkId: 1, wr: "WR1367", exactLb: 5, wholeLb: 5, kind: "exact" }],
  exactTotalLb: 15.5,
  billedLb: 16,
  separateLb: 18,
  savingLb: 2,
  savingUsd: 18.79,
  savingTtd: 127.77,
  freightSavingUsd: 4.79,
  insurance: { combinedValueUsd: 155.26, chargedUsd: 2, separateUsd: 16, savingUsd: 14, tvWrs: [], coverCapUsd: 500 },
};

// What the admin sent the app from 2026-10-21 until this fix (no packages, no separateLb, insurance trimmed).
const trimmed = {
  ready: true,
  allExact: true,
  exactTotalLb: 15.5,
  billedLb: 16,
  savingLb: 2,
  savingUsd: 18.79,
  savingTtd: 127.77,
  insurance: { chargedUsd: 2, coverCapUsd: 500 },
  customs: [{ pkId: 1, duty: 47.6, opt: 16.66, vat: 37.78, other: 0 }],
};

describe("Consolidated Bill combined-weight panel", () => {
  it("renders with the full shape", () => {
    const html = render(full);
    expect(html).toContain("data-cb-weights-panel");
    expect(html).toContain("Combined exact weight");
    expect(html).toContain("15.5 lb");
    expect(html).toContain("Billed weight (rounded up once)");
    expect(html).toContain("16 lb");
    expect(html).toContain("Billed separately (each package rounded up)");
    expect(html).toContain("18 lb");
    expect(html).toContain("Insurance (group, combined value US$155.26)");
    expect(html).toContain("Insurance billed separately (per package)");
    expect(html).toContain("Saved with Consolidated Billing: US$18.79 (TT$127.77) — 2 lb of freight + US$14.00 of insurance");
  });

  it("renders with the trimmed shape the admin sends, without crashing", () => {
    const html = render(trimmed);
    expect(html).toContain("data-cb-weights-panel");
    expect(html).toContain("15.5 lb");
    expect(html).toContain("16 lb");
    expect(html).toContain("Insurance (group)");
    expect(html).toContain("Each package is still covered on its own, up to US$500.");
    expect(html).toContain("Saved with Consolidated Billing: US$18.79 (TT$127.77) — 2 lb of freight");
    // Absent figures drop their own rows rather than printing "undefined".
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Billed separately");
  });

  it("shows the separate weight once the admin sends separateLb", () => {
    expect(render({ ...trimmed, separateLb: 18 })).toContain("Billed separately (each package rounded up)");
  });

  it("hides cleanly with no fields, junk, or a group not priced yet", () => {
    for (const w of [null, undefined, {}, "x", 7, { ready: true }, { ready: true, billedLb: 0 }, { ready: false, billedLb: 16 }, { ready: true, billedLb: "16" }]) {
      expect(cbWeightsPanelView(w)).toBeNull();
      expect(render(w)).toBe("");
    }
  });

  it("guards every optional field one at a time", () => {
    const keys = Object.keys(full).filter((k) => k !== "billedLb" && k !== "ready");
    for (const k of keys) {
      const w: Record<string, unknown> = { ...full };
      delete w[k];
      expect(() => render(w)).not.toThrow();
      expect(render(w)).toContain("16 lb");
    }
    for (const k of Object.keys(full.insurance)) {
      const ins: Record<string, unknown> = { ...full.insurance };
      delete ins[k];
      expect(() => render({ ...full, insurance: ins })).not.toThrow();
    }
    expect(() => render({ ...full, insurance: { tvWrs: "WR1" } })).not.toThrow();
  });
});
