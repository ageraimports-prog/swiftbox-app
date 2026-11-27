import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { customerFacingView, type CustomerFacingInput } from "./customer-facing-status-core";
import { packageBadge } from "./status";
import { PREALERT_LOCKED_NOTE, prealertCardStatus, type PrealertPackage } from "./prealert-status";

// Fatima Cummings SBX-0959, 27 Nov 2026: WR1881 / WR1791 delivered and on paid
// INV-000458, yet their pre-alert cards read as a customs stage. A matched card
// now shows the package's own view — the very object the package list shows.

/** One package as lib/package-views.ts builds it: the shared rule over its facts. */
function pkg(pkId: number, wr: string, tracking: string, facts: CustomerFacingInput): PrealertPackage {
  return { pkId, wr, tracking, status: customerFacingView({ pkType: 1, nowMs: Date.UTC(2026, 10, 27, 15), ...facts }) };
}

const issued = "2026-11-20 10:00:00";

describe("pre-alert card status follows the matched package", () => {
  it("package Delivered → the card reads Delivered (Fatima's WR1881)", () => {
    const list = [pkg(1881, "WR1881", "GFUS01082665844993", { shipStatus: 5, cleared: true, invoiceIssuedAt: issued })];
    const card = prealertCardStatus("GFUS01082665844993", list);
    expect(card.matched).toBe(true);
    if (!card.matched) return;
    expect(card.status.label).toBe("Delivered");
    expect(packageBadge(card.status).label).toBe("Delivered");
    expect(card.wrs).toEqual(["WR1881"]);
  });

  it("package Out for Delivery → Out for Delivery", () => {
    const list = [pkg(1791, "WR1791", "GFUS01082747236740", { shipStatus: 4, cleared: true, invoiceIssuedAt: issued })];
    const card = prealertCardStatus("gfus 0108 2747 2367 40", list);
    expect(card.matched && card.status.label).toBe("Out for Delivery");
  });

  it("unmatched → not matched (the card keeps its awaiting / pending label)", () => {
    const list = [pkg(1881, "WR1881", "GFUS01082665844993", { shipStatus: 5 })];
    expect(prealertCardStatus("1Z999AA10123456784", list)).toEqual({ matched: false });
    expect(prealertCardStatus("", list)).toEqual({ matched: false });
  });

  it("display floor BEHIND the real status → the card shows exactly the package list's label", () => {
    // Floor 1 (In Transit shown before), real = delivered: the real stage wins, same object as the list.
    const p = pkg(1, "WR1", "TBA123456789012", { shipStatus: 5, cleared: true, displayFloor: 1 });
    const card = prealertCardStatus("TBA123456789012", [p]);
    expect(card.matched && card.status).toBe(p.status);
    expect(card.matched && card.status.label).toBe("Delivered");
  });

  it("display floor AHEAD of the real status → never further than the package list (status-ahead guard)", () => {
    // A released CB group whose stored floor says Ready while its last member is still at customs.
    const facts: CustomerFacingInput = {
      shipStatus: 3,
      cb: { state: "released", billId: null, billLifecycle: null, offBillReason: null, groupReleased: true, groupLast: 2, groupFloor: 4 },
      displayFloor: 4,
    };
    const p = pkg(2, "WR2", "TBA999999999999", facts);
    const card = prealertCardStatus("TBA999999999999", [p]);
    expect(card.matched && card.status.label).toBe(p.status.label);
    expect(card.matched && card.status.ready).toBe(false);
    expect(card.matched && card.status.label).not.toMatch(/Ready|Delivered/);
  });

  it("a split parcel matching two packages → the LEAST advanced (never ahead of either)", () => {
    const list = [
      pkg(10, "WR10", "9400111899223344556677", { shipStatus: 5, cleared: true }),
      pkg(11, "WR11", "420330159400111899223344556677", { shipStatus: 2 }),
    ];
    const card = prealertCardStatus("9400111899223344556677", list);
    expect(card.matched).toBe(true);
    if (!card.matched) return;
    expect(card.wrs).toEqual(["WR10", "WR11"]);
    expect(card.status.stage).toBe(1);
  });

  it("the lock line names no stage", () => {
    expect(PREALERT_LOCKED_NOTE).not.toMatch(/cleared|customs|delivered/i);
  });
});

describe("wiring: one reading for the package list and the pre-alert cards", () => {
  const root = join(__dirname, "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  it("both routes read the status through customerPackageViews; the pre-alert route never shows sp.status for a match", () => {
    const pk = read("app/api/packages/route.ts");
    const pa = read("app/api/prealerts/route.ts");
    expect(pk).toMatch(/customerPackageViews\(session\.id\)/);
    expect(pa).toMatch(/customerPackageViews\(session\.id\)/);
    expect(pa).toMatch(/prealertCardStatus\(/);
    expect(pk).not.toMatch(/viewFor\(/);
    expect(pa).not.toMatch(/viewFor\(/);
  });

  it("the card's badge comes from packageBadge(packageStatus) once matched", () => {
    const page = read("app/dashboard/prealerts/page.tsx");
    expect(page).toMatch(/packageBadge\(pa\.packageStatus\)/);
    expect(page).not.toMatch(/const badge = STATUS_BADGE\[pa\.status\]/);
  });
});
