import {describe,it,expect} from "vitest";
import {shipStatusToStage,freightLabel, packageBadge, stageMeta } from "./status";
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
  it("shows 'waiting for your group' while a package waits (never where it is)", () => {
    expect(packageBadge(3, true).label).toBe("Consolidated Billing: waiting for your group");
    expect(packageBadge(2, true).label).not.toMatch(/trinidad|clearance|arriv/i);
  });
  it("falls back to the real stage when not waiting", () => {
    expect(packageBadge(3, false).label).toBe(stageMeta(3).label);
    expect(packageBadge(5).label).toBe(stageMeta(5).label);
  });
});
