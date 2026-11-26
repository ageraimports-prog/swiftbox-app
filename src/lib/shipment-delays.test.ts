import { describe, expect, it } from "vitest";
import { customerFacingView, clearanceFactsOfRow } from "./customer-facing-status-core";
import { NOTICE_BADGE, packageBadge, stepLabels } from "./status";

// Shipment delays (admin DELAY_STATUS_PLAN.md, 2026-11-26): an overlay on one step.
const NOW = Date.parse("2026-11-26T14:00:00Z");

describe("shipment delays in the app", () => {
  it("airline bumped relabels In Transit, bar stays on step 1", () => {
    const v = customerFacingView({ shipStatus: 2, pkType: 1, clearance: clearanceFactsOfRow("#airline_bumped|2026-11-27"), nowMs: NOW });
    expect(v.label).toBe("Delayed by airline – tentatively scheduled for Fri 27 Nov");
    expect(v.stage).toBe(1);
    expect(stepLabels(v, 1)[1]).toBe(v.label);
    expect(packageBadge(v).badge).toBe(NOTICE_BADGE);
  });
  it("part shipment relabels the landed step", () => {
    const v = customerFacingView({ shipStatus: 3, pkType: 1, clearance: clearanceFactsOfRow("2026-11-28#part_shipment|"), nowMs: NOW });
    expect(v.label).toBe("Delayed – awaiting remaining cargo from the airline");
    expect(stepLabels(v, 1)[2]).toBe(v.label);
  });
  it("when the delay ends the customer sees Awaiting Clearance / Clearance Scheduled", () => {
    expect(customerFacingView({ shipStatus: 3, pkType: 1, clearance: clearanceFactsOfRow("#"), nowMs: NOW }).label).toBe("Awaiting Clearance");
    expect(customerFacingView({ shipStatus: 3, pkType: 1, clearance: clearanceFactsOfRow("2026-11-28#"), nowMs: NOW }).label).toBe("Clearance Scheduled – Sat 28 Nov");
  });
  it("an open Consolidated Billing group keeps Consolidated", () => {
    const v = customerFacingView({ shipStatus: 2, pkType: 1, clearance: clearanceFactsOfRow("#airline_bumped|"), cb: { state: "open", billId: null, billLifecycle: null, offBillReason: null, groupReleased: false }, nowMs: NOW });
    expect(v.label).toBe("Consolidated");
  });
});
