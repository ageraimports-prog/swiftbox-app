import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  customerFacingView,
  CB_CONSOLIDATING_LABEL,
  CB_READY_LABEL,
  type CbMembership,
} from "./customer-facing-status-core";
import { packageBadge, stepLabels } from "./status";

/**
 * THE customer-facing status rule (Brent, 2026-10-13). The full matrix is in
 * SwiftboxAdmin scripts/test-customer-facing-status.ts; this locks what the
 * app relies on and that the three copies are the same file.
 */
const OPEN: CbMembership = { state: "open", billId: null, billLifecycle: null, offBillReason: null };
const CLOSED: CbMembership = { state: "closed", billId: null, billLifecycle: null, offBillReason: null };
const REL_DRAFT: CbMembership = { state: "released", billId: 3, billLifecycle: "draft", offBillReason: null };
const REL_ISSUED: CbMembership = { state: "released", billId: 3, billLifecycle: "issued", offBillReason: null };
const MON = "2026-10-12T10:00:00-04:00";
const TUE5 = Date.parse("2026-10-13T17:00:00-04:00");

describe("Consolidated Billing masking", () => {
  it("In Miami until it leaves, then Consolidating at every stage until the bill is issued", () => {
    expect(customerFacingView({ shipStatus: null, cb: OPEN }).label).toBe("In Miami");
    for (const m of [OPEN, CLOSED, REL_DRAFT]) {
      for (const s of [0, 1, 2, 3]) {
        const v = customerFacingView({ shipStatus: s, cb: m, cleared: s === 3 });
        expect(v.label).toBe(CB_CONSOLIDATING_LABEL);
        expect(v.consolidating).toBe(true);
        expect(packageBadge(v).label).not.toMatch(/transit|piarco|clearance|trinidad|arriv/i);
      }
    }
  });
  it("an unmanifested package stays In Miami after 5 pm; a manifested member can consolidate", () => {
    const v = customerFacingView({ shipStatus: null, cb: CLOSED, airdrop: { receivedAt: MON, mode: "air" }, nowMs: TUE5 });
    expect(v.label).toBe('In Miami');
    expect(customerFacingView({shipStatus:1,cb:CLOSED,airdrop:{receivedAt:MON,mode:'air'},nowMs:TUE5}).label).toBe(CB_CONSOLIDATING_LABEL);
  });
  it("once the bill is issued: Ready for delivery → Out for Delivery → Delivered", () => {
    expect(customerFacingView({ shipStatus: 3, cleared: true, cb: REL_ISSUED }).label).toBe(CB_READY_LABEL);
    expect(customerFacingView({ shipStatus: 4, cb: REL_ISSUED }).label).toBe("Out for Delivery");
    expect(customerFacingView({ shipStatus: 5, cb: REL_ISSUED }).label).toBe("Delivered");
  });
  it("a member's stepper has no transit or clearance step", () => {
    const v = customerFacingView({ shipStatus: 2, cb: OPEN });
    expect(stepLabels(v).join(" ")).not.toMatch(/transit|clearance|piarco/i);
    expect(stepLabels(customerFacingView({ shipStatus: 2 }), 1)[1]).toBe("In Transit to Piarco");
  });
  it("the office's notice wins", () => {
    const v = customerFacingView({ shipStatus: 3, cb: CLOSED, override: { key: "delayed", note: "Weather", baseStage: 2 } });
    expect(v.label).toBe("Delayed");
    expect(v.note).toBe("Weather");
  });
  it("non-members are unchanged", () => {
    expect(customerFacingView({ shipStatus: 2, pkType: 1 }).label).toBe("In Transit to Piarco");
    expect(customerFacingView({ shipStatus: 3 }).label).toBe("Awaiting Clearance");
    expect(customerFacingView({ shipStatus: 3, cleared: true }).label).toBe("Awaiting Clearance");
  });
});

describe("customer-facing-status-core (code-identical in admin, app and website)", () => {
  it("matches the sibling checkouts when they sit beside this one", () => {
    const mine = readFileSync(join(__dirname, "customer-facing-status-core.ts"), "utf8").replace(/\r\n/g, "\n");
    const siblings = [
      ["SwiftboxAdmin", "lib"], ["swiftbox-admin", "lib"],
      ["SwiftBox Rebranded Website", "src/lib"], ["swiftbox-website", "src/lib"],
    ];
    for (const [dir, sub] of siblings) {
      const explicit = dir.toLowerCase().includes("admin") ? process.env.SWIFTBOX_ADMIN_DIR : process.env.SWIFTBOX_WEBSITE_DIR;
      const p = explicit ? join(explicit, sub, "customer-facing-status-core.ts") : join(__dirname, "..", "..", "..", dir, sub, "customer-facing-status-core.ts");
      if (existsSync(p)) expect(readFileSync(p, "utf8").replace(/\r\n/g, "\n")).toBe(mine);
    }
  });
});
