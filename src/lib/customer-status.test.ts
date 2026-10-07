import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { customerStageOf, customerStatusView, isOverrideActive } from "./customer-status-core";
import { CB_WAITING_LABEL } from "./consolidatedBilling";
import { NOTICE_BADGE, STAGES, packageBadge, shipStatusToStage, shownStage } from "./status";

describe("customer-status-core (code-identical to the admin's copy)", () => {
  it("is byte-identical to SwiftboxAdmin lib/customer-status-core.ts when that checkout is beside this one", () => {
    const mine = readFileSync(join(__dirname, "customer-status-core.ts"), "utf8").replace(/\r\n/g, "\n");
    let admin: string | null = null;
    for (const dir of ["SwiftboxAdmin", "SwiftboxAdmin-custstatus"]) {
      try {
        admin = readFileSync(join(__dirname, "..", "..", "..", dir, "lib", "customer-status-core.ts"), "utf8").replace(/\r\n/g, "\n");
        break;
      } catch {
        /* not checked out here */
      }
    }
    if (admin != null && admin.includes("CUSTOMER_STATUS_TABLE")) expect(mine).toBe(admin);
  });

  it("maps raw ship_status exactly like shipStatusToStage", () => {
    for (const s of [null, 0, 1, 2, 3, 4, 5, -1, 9]) expect(customerStageOf(s)).toBe(shipStatusToStage(s));
  });

  it("stage label shows while behind, clears once the real stage catches up", () => {
    const o = { key: "awaiting_clearance", note: null, baseStage: 0 };
    expect(isOverrideActive(o, 1)).toBe(true);
    expect(isOverrideActive(o, 2)).toBe(false);
    expect(isOverrideActive(o, 4)).toBe(false);
  });

  it("notice clears as soon as the real stage moves forward", () => {
    const o = { key: "delayed", note: "x", baseStage: 0 };
    expect(isOverrideActive(o, 0)).toBe(true);
    expect(isOverrideActive(o, 1)).toBe(false);
  });

  it("never shows a stage label on a Consolidated Billing package", () => {
    expect(customerStatusView({ key: "in_transit", note: null, baseStage: 0 }, 0, true)).toBeNull();
    expect(customerStatusView({ key: "on_hold", note: null, baseStage: 0 }, 0, true)?.kind).toBe("notice");
  });
});

describe("packageBadge / shownStage with an office-set status", () => {
  const stage = customerStatusView({ key: "out_for_delivery", note: null, baseStage: 0 }, 0, false);
  const notice = customerStatusView({ key: "on_hold", note: "Call us", baseStage: 0 }, 0, true);

  it("a stage label takes that stage's badge and moves the bar", () => {
    expect(packageBadge(null, false, false, stage)).toEqual(STAGES[3]);
    expect(shownStage(null, stage)).toBe(3);
  });

  it("a notice is highlighted, wins over Consolidated Billing, and leaves the bar at the real stage", () => {
    expect(packageBadge(3, true, false, notice)).toEqual({ label: "On hold — contact us", badge: NOTICE_BADGE });
    expect(shownStage(3, notice)).toBe(2);
  });

  it("no override → exactly as before", () => {
    expect(packageBadge(3, true, false, null).label).toBe(CB_WAITING_LABEL);
    expect(packageBadge(4, false, false)).toEqual(STAGES[3]);
    expect(shownStage(4, null)).toBe(3);
  });

  it("nothing in the label says it was set by hand", () => {
    for (const v of [stage, notice]) expect(JSON.stringify(v)).not.toMatch(/manual|override|by hand|staff|admin/i);
  });
});
