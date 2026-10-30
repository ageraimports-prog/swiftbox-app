import {describe,it,expect} from "vitest";
import {shipStatusToStage,freightLabel, packageBadge, stageMeta } from "./status";
import { customerFacingView } from "./customer-facing-status-core";
describe("canonical Swiftbox shipment progress",()=>{
  it("keeps unmanifested and stage 1 packages in Miami",()=>{
    for(const value of [null,undefined,0,1])expect(shipStatusToStage(value)).toBe(0);
  });
  it("maps every admin stage without advancing early",()=>{
    expect([1,2,3,4,5].map(shipStatusToStage)).toEqual([0,1,2,3,4]);
  });
  it("never guesses delivery for an unknown value",()=>{
    for(const value of [6,-1,1.5,NaN,Infinity])expect(shipStatusToStage(value)).toBe(0);
  });
  it("retains sea and air and shows provider express",()=>{
    expect(freightLabel(1,"express")).toBe("EXPRESS");
    expect(freightLabel(2,"sea")).toBe("SEA");
    expect(freightLabel(1)).toBe("AIR");
  });
});

describe("packageBadge (Consolidated Billing)", () => {
  const OPEN = { state: "open", billId: null, billLifecycle: null, offBillReason: null };
  it("shows 'Consolidating' while a package waits (never where it is)", () => {
    expect(packageBadge(customerFacingView({ shipStatus: 3, cb: OPEN })).label).toBe("Consolidated");
    expect(packageBadge(customerFacingView({ shipStatus: 2, cb: OPEN })).label).not.toMatch(/trinidad|clearance|arriv|transit|piarco/i);
  });
  it("falls back to the real stage when not a member", () => {
    expect(packageBadge(customerFacingView({ shipStatus: 3 })).label).toBe(stageMeta(3).label);
    expect(packageBadge(customerFacingView({ shipStatus: 5 })).label).toBe(stageMeta(5).label);
    expect(packageBadge(null, 5).label).toBe(stageMeta(5).label);
  });
});
