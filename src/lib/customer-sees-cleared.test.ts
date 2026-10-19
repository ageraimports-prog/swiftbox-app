import { describe, expect, it } from "vitest";
import { customerFacingView, CLEARED_READY_LABEL } from "./customer-facing-status-core";
import { packageBadge, stepLabels } from "./status";
import { INVOICE_ISSUED_AT_SQL } from "./customer-status";

// Brent, 2026-10-19: an issued invoice means the package is in Trinidad and
// ready to dispatch — the customer sees "Cleared – Ready to Deliver".
describe("issued invoice → Cleared – Ready to Deliver", () => {
  const issued = "2026-10-17 12:00:00";

  it("raw 3 (Awaiting Clearance before) reads Cleared – Ready to Deliver, step 2", () => {
    const v = customerFacingView({ shipStatus: 3, pkType: 1, invoiceIssuedAt: issued });
    expect(v.label).toBe(CLEARED_READY_LABEL);
    expect(v.stage).toBe(2);
    expect(v.ready).toBe(true);
    expect(stepLabels(v, 1)[2]).toBe(CLEARED_READY_LABEL);
    expect(packageBadge(v).label).toBe(CLEARED_READY_LABEL);
  });

  it("without an issued invoice nothing changes", () => {
    const v = customerFacingView({ shipStatus: 3, cleared: true, pkType: 1 });
    expect(v.label).toBe("Awaiting Clearance");
    expect(v.ready).toBe(false);
    expect(stepLabels(v, 1)[2]).toBe("Awaiting Clearance");
  });

  it("a held Consolidated Billing member with an issued invoice is no longer masked", () => {
    const v = customerFacingView({ shipStatus: 3, pkType: 1, invoiceIssuedAt: issued, cb: { state: "closed", billId: null, billLifecycle: null, offBillReason: null } });
    expect(v.label).toBe(CLEARED_READY_LABEL);
    expect(v.consolidating).toBe(false);
    expect(stepLabels(v)[2]).toBe(CLEARED_READY_LABEL);
  });

  it("a Delayed notice from before the issue is ignored; one set after shows", () => {
    const before = customerFacingView({ shipStatus: 3, invoiceIssuedAt: issued, override: { key: "delayed", note: null, baseStage: 2, setAt: "2026-10-16 08:00:00" } });
    expect(before.label).toBe(CLEARED_READY_LABEL);
    const after = customerFacingView({ shipStatus: 3, invoiceIssuedAt: issued, override: { key: "delayed", note: null, baseStage: 2, setAt: "2026-10-18 08:00:00" } });
    expect(after.label).toBe("Delayed");
  });

  it("out for delivery and delivered are unchanged", () => {
    expect(customerFacingView({ shipStatus: 4, invoiceIssuedAt: issued }).label).toBe("Out for Delivery");
    expect(customerFacingView({ shipStatus: 5, invoiceIssuedAt: issued }).label).toBe("Delivered");
  });

  it("the package APIs read the issued invoice by package", () => {
    expect(INVOICE_ISSUED_AT_SQL).toMatch(/lifecycle = 'issued'/);
    expect(INVOICE_ISSUED_AT_SQL).toMatch(/ip_cf\.pk_id = p\.pk_id/);
  });
});
