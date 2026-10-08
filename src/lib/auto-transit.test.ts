import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  autoTransitAt,
  inTransitLabel,
  isAutoTransitDue,
  nextDropAfter,
  ttDropLabel,
} from "./auto-transit-core";
import { customerStatusView } from "./customer-status-core";
import { packageBadge, stageLabel, stageMeta } from "./status";

/** Trinidad wall time → ISO with the -04:00 offset. 2026-10-12 is a Monday. */
const tt = (d: string, hm: string) => `2026-10-${d}T${hm}:00-04:00`;
const at = (d: string, hm: string) => Date.parse(tt(d, hm));
const flip = (d: string, hm: string, mode = "air") => {
  const ms = autoTransitAt(tt(d, hm), mode);
  return ms == null ? null : ttDropLabel(ms);
};

describe("5 pm In Transit rule (Brent, 2026-10-08)", () => {
  it("Monday before 5 pm → Tuesday 5 pm", () => {
    expect(flip("12", "10:00")).toBe("Tue 13 Oct, 5:00 pm");
    expect(flip("12", "16:59")).toBe("Tue 13 Oct, 5:00 pm");
  });
  it("Monday 5 pm to Tuesday 5 pm → Wednesday 5 pm (exactly 5:00 pm is the next window)", () => {
    expect(flip("12", "17:00")).toBe("Wed 14 Oct, 5:00 pm");
    expect(flip("12", "18:30")).toBe("Wed 14 Oct, 5:00 pm");
    expect(flip("13", "16:59")).toBe("Wed 14 Oct, 5:00 pm");
  });
  it("no weekend drops", () => {
    expect(flip("15", "18:00")).toBe("Mon 19 Oct, 5:00 pm"); // Thu evening
    expect(flip("16", "09:00")).toBe("Mon 19 Oct, 5:00 pm"); // Fri morning
    expect(flip("16", "18:00")).toBe("Tue 20 Oct, 5:00 pm"); // Fri evening
    expect(flip("17", "12:00")).toBe("Tue 20 Oct, 5:00 pm"); // Saturday
    expect(flip("18", "12:00")).toBe("Tue 20 Oct, 5:00 pm"); // Sunday
  });
  it("is due from 5:00 pm exactly, not a minute before", () => {
    expect(isAutoTransitDue(tt("12", "10:00"), "air", at("13", "16:59"))).toBe(false);
    expect(isAutoTransitDue(tt("12", "10:00"), "air", at("13", "17:00"))).toBe(true);
  });
  it("reads Airdrop's UTC timestamps (Mon 4:50 pm Trinidad = 20:50 UTC)", () => {
    expect(ttDropLabel(autoTransitAt("2026-10-12T20:50:00.123456+00:00", "air")!)).toBe("Tue 13 Oct, 5:00 pm");
    expect(ttDropLabel(autoTransitAt("2026-10-12T21:00:00+00:00", "air")!)).toBe("Wed 14 Oct, 5:00 pm");
  });
  it("air and express only; sea, missing or unreadable times never flip", () => {
    expect(flip("12", "10:00", "express")).toBe("Tue 13 Oct, 5:00 pm");
    expect(flip("12", "10:00", "sea")).toBeNull();
    expect(autoTransitAt(null, "air")).toBeNull();
    expect(autoTransitAt("not a date", "air")).toBeNull();
    expect(autoTransitAt(tt("12", "10:00"), null)).toBeNull();
  });
  it("nextDropAfter skips the weekend from Friday 5 pm", () => {
    expect(ttDropLabel(nextDropAfter(at("16", "17:00")))).toBe("Mon 19 Oct, 5:00 pm");
  });
});

describe("merge with the office's status", () => {
  it("shows In Transit while the real stage is In Miami", () => {
    expect(customerStatusView(null, 0, false, true)).toEqual({ kind: "stage", stage: 1, label: "In Transit", note: null });
  });
  it("hands over to the real status once it reaches In Transit", () => {
    expect(customerStatusView(null, 1, false, true)).toBeNull();
    expect(customerStatusView(null, 2, false, true)).toBeNull();
  });
  it("never for a package in an unreleased Consolidated Billing group (R13)", () => {
    expect(customerStatusView(null, 0, true, true)).toBeNull();
  });
  it("a Delayed / On hold the office set wins", () => {
    expect(customerStatusView({ key: "delayed", note: "Missed the drop", baseStage: 0 }, 0, false, true)?.label).toBe("Delayed");
  });
  it("a stage label the office set further ahead wins", () => {
    expect(customerStatusView({ key: "awaiting_clearance", note: null, baseStage: 0 }, 0, false, true)).toMatchObject({ kind: "stage", stage: 2 });
  });
  it("nothing changes when the rule is not due", () => {
    expect(customerStatusView(null, 0, false, false)).toBeNull();
  });
});

describe("In Transit wording", () => {
  it("air says Piarco, sea does not", () => {
    expect(inTransitLabel(1)).toBe("In Transit to Piarco");
    expect(inTransitLabel(2)).toBe("In Transit");
    expect(stageLabel(1, 1)).toBe("In Transit to Piarco");
    expect(stageLabel(1, 2)).toBe("In Transit");
    expect(stageLabel(0, 1)).toBe("In Miami");
  });
  it("the badge uses it for the real stage and for the automatic one", () => {
    expect(stageMeta(2, 1).label).toBe("In Transit to Piarco");
    const auto = customerStatusView(null, 0, false, true);
    expect(packageBadge(null, false, false, auto, 1).label).toBe("In Transit to Piarco");
    expect(packageBadge(null, false, false, null, 1).label).toBe("In Miami");
  });
});

describe("auto-transit-core (code-identical in admin, app and website)", () => {
  it("matches the sibling checkouts when they sit beside this one", () => {
    const mine = readFileSync(join(__dirname, "auto-transit-core.ts"), "utf8").replace(/\r\n/g, "\n");
    const siblings = [
      ["SwiftboxAdmin", "lib"], ["swiftbox-admin", "lib"],
      ["SwiftBox Rebranded Website", "src/lib"], ["swiftbox-website", "src/lib"],
    ];
    for (const [dir, sub] of siblings) {
      const p = join(__dirname, "..", "..", "..", dir, sub, "auto-transit-core.ts");
      if (existsSync(p)) expect(readFileSync(p, "utf8").replace(/\r\n/g, "\n")).toBe(mine);
    }
  });
});
