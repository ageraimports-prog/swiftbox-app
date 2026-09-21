import {describe,it,expect} from "vitest";
import {shipStatusToStage,freightLabel} from "./status";
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
