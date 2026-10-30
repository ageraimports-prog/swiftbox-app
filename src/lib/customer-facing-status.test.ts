import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  customerFacingView,
  CB_CONSOLIDATING_LABEL,
  CB_READY_LABEL,
  CB_RECEIVED_MIAMI_LABEL,
  PREALERT_FLAGGED_LABEL,
  PREALERT_NOT_RECEIVED_LABEL,
  prealertFacingStatus,
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
  it("a group still collecting reads Consolidating from the moment a package joins, wherever it is (Brent, 2026-10-26)", () => {
    for (const m of [OPEN, CLOSED]) {
      for (const s of [null, 0, 1]) {
        const v = customerFacingView({ shipStatus: s, cb: m });
        expect(v.label).toBe(CB_CONSOLIDATING_LABEL);
        expect(v.stage).toBe(1);
        expect(v.consolidating).toBe(true);
      }
    }
    // Released (older path without group facts): Received in Miami until it leaves Miami.
    expect(customerFacingView({ shipStatus: null, cb: REL_DRAFT }).label).toBe(CB_RECEIVED_MIAMI_LABEL);
    for (const m of [OPEN, CLOSED, REL_DRAFT]) {
      for (const s of [2, 3]) {
        const v = customerFacingView({ shipStatus: s, cb: m, cleared: s === 3 });
        expect(v.label).toBe(CB_CONSOLIDATING_LABEL);
        expect(v.consolidating).toBe(true);
        expect(packageBadge(v).label).not.toMatch(/transit|piarco|clearance|trinidad|arriv/i);
      }
    }
  });
  it("a member past its 5 pm drop is Consolidating, never In Transit to Piarco; an ordinary package flips", () => {
    const v = customerFacingView({ shipStatus: null, cb: CLOSED, airdrop: { receivedAt: MON, mode: "air" }, nowMs: TUE5 });
    expect(v.label).toBe(CB_CONSOLIDATING_LABEL);
    expect(customerFacingView({shipStatus:1,cb:CLOSED,airdrop:{receivedAt:MON,mode:'air'},nowMs:TUE5}).label).toBe(CB_CONSOLIDATING_LABEL);
    expect(customerFacingView({shipStatus:null,pkType:1,airdrop:{receivedAt:MON,mode:'air'},nowMs:TUE5}).label).toBe("In Transit to Piarco");
    expect(customerFacingView({shipStatus:2,cb:CLOSED}).label).toBe(CB_CONSOLIDATING_LABEL);
  });
  it("with group facts: ONE label before Send now (Consolidated); after Send now the last-identified member's status, no place", () => {
    const collecting: CbMembership = { ...OPEN, groupReleased: false, groupLast: 0, groupFloor: null };
    const labels = new Set([null, 0, 1, 2, 3].map((s) => customerFacingView({ shipStatus: s, cb: collecting, cleared: s === 3 }).label));
    expect([...labels]).toEqual([CB_CONSOLIDATING_LABEL]);
    expect(customerFacingView({ shipStatus: null, cb: collecting, displayFloor: 1 }).label).toBe(CB_CONSOLIDATING_LABEL);
    expect(customerFacingView({ shipStatus: 3, cb: { ...collecting, state: "released", groupReleased: true, groupLast: 0 } }).label).toBe("Consolidated");
    // Brent, 2026-10-29: the LAST package identified decides — an earlier one held back in Miami
    // reads "In Transit" with the rest once the last one has shipped. Never "to Piarco".
    const released = { ...collecting, state: "released", groupReleased: true, groupLast: 1 };
    expect(customerFacingView({ shipStatus: null, cb: released }).label).toBe("In Transit");
    expect(customerFacingView({ shipStatus: 3, cleared: true, cb: released, pkType: 1 }).label).toBe("In Transit");
    const groupSteps = stepLabels(customerFacingView({ shipStatus: 2, cb: released }), 1);
    expect(groupSteps.join(" ")).not.toMatch(/miami|piarco|trinidad|warehouse|airport/i);
    expect(stepLabels(customerFacingView({ shipStatus: null, cb: collecting })).join(" ")).not.toMatch(/miami|piarco|trinidad|warehouse/i);
    // Not consolidated: unchanged.
    expect(customerFacingView({ shipStatus: 2, pkType: 1 }).label).toBe("In Transit to Piarco");
    expect(stepLabels(customerFacingView({ shipStatus: 2, pkType: 1 }), 1)).toContain("In Transit to Piarco");
  });
  it("R4: a pre-alert with no package yet", () => {
    expect(prealertFacingStatus({}).label).toBe(PREALERT_NOT_RECEIVED_LABEL);
    expect(prealertFacingStatus({ flagged: true }).label).toBe(PREALERT_FLAGGED_LABEL);
    for (const l of [PREALERT_NOT_RECEIVED_LABEL, PREALERT_FLAGGED_LABEL, CB_RECEIVED_MIAMI_LABEL]) expect(l).not.toMatch(/trinidad|chaguanas|held|hialeah|[0-9]/i);
    for (const flagged of [false, true]) expect(prealertFacingStatus({ flagged, consolidated: true }).label).not.toMatch(/miami|warehouse/i);
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
