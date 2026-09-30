import { describe, expect, it } from "vitest";
import { hasPrealertSql, needsPrealertSql, PREALERT_SINCE } from "./prealert-needs";
import {
  arrivalDateLabel,
  carrierLabel,
  isPlayDemoSql,
  packagesPhrase,
  parseDescription,
  parseValueUsd,
  toastMessage,
  warehouseLabel,
  weightLabel,
} from "./prealert-pick";
import { safeNext } from "./next-path";

const flat = (s: string) => s.replace(/\s+/g, " ");

describe("needsPrealertSql", () => {
  it("is received + not shipped + no linked pre-alert + a member's", () => {
    const s = flat(needsPrealertSql("p"));
    for (const piece of [
      "p.user_id > 0",
      "nu.type = 'member'",
      `p.date >= '${PREALERT_SINCE}'`,
      "LENGTH(TRIM(p.tracking)) > 0",
      "p.status = 0",
      "NOT EXISTS (SELECT 1 FROM mod_shipment nms WHERE nms.package_id = p.pk_id)",
    ]) expect(s).toContain(piece);
    expect(s).toContain(`NOT ${flat(hasPrealertSql("p"))}`);
  });
  it("links pre-alerts the admin's way: same customer, TRIM'd non-blank tracking, both tables", () => {
    const s = flat(hasPrealertSql("p"));
    expect(s).toContain("FROM mod_prealert npa WHERE npa.user_id = p.user_id");
    expect(s).toContain("FROM swiftbox_prealerts nsp WHERE nsp.user_id = p.user_id");
    expect(s).toContain("TRIM(nsp.tracking_number) = TRIM(p.tracking)");
    expect(s).toContain("LENGTH(TRIM(nsp.tracking_number)) > 0");
  });
  it("refuses an unsafe alias", () => {
    expect(() => needsPrealertSql("p;--")).toThrow();
    expect(() => isPlayDemoSql("x y")).toThrow();
  });
  it("demo match is the account email or the DEMO0364 prefix", () => {
    expect(isPlayDemoSql("p")).toBe(
      "(p.user_id IN (SELECT id FROM users WHERE email = 'demo@swiftboxtt.com') OR p.tracking LIKE 'DEMO0364%')"
    );
  });
});

describe("parseValueUsd", () => {
  it("takes decimals", () => {
    expect(parseValueUsd("12.50")).toBe(12.5);
    expect(parseValueUsd("12.5")).toBe(12.5);
    expect(parseValueUsd(".5")).toBe(0.5);
    expect(parseValueUsd("$ 1,234.56")).toBe(1234.56);
    expect(parseValueUsd("99999999.99")).toBe(99999999.99);
    expect(parseValueUsd(" 7 ")).toBe(7);
  });
  it("rejects nonsense, zero, negatives and a third decimal", () => {
    for (const bad of ["", "0", "0.00", "-5", "12.555", "abc", "1,23", "100000000", "1e3", null, undefined]) {
      expect(parseValueUsd(bad), String(bad)).toBeNull();
    }
  });
});

describe("labels", () => {
  it("carrier from shipper", () => {
    expect(carrierLabel("AMAZON")).toBe("Amazon");
    expect(carrierLabel("fedex")).toBe("FedEx");
    expect(carrierLabel("JT WORLDWIDE CORP.")).toBe("JT Worldwide Corp.");
    expect(carrierLabel("X")).toBeNull();
    expect(carrierLabel("UNKOWN")).toBeNull();
    expect(carrierLabel("")).toBeNull();
  });
  it("date, weight, warehouse, count", () => {
    expect(arrivalDateLabel("2026-09-11")).toBe("Sep 11, 2026");
    expect(weightLabel(3, null)).toBe("3");
    expect(weightLabel(3, "2.7500")).toBe("2.75");
    expect(warehouseLabel(1)).toBe("Hialeah");
    expect(warehouseLabel("0")).toBe("Medley");
    expect(packagesPhrase(1)).toBe("1 package");
    expect(packagesPhrase(3)).toBe("3 packages");
  });
  it("description", () => {
    expect(parseDescription("  two   shirts ")).toBe("two shirts");
    expect(parseDescription("   ")).toBeNull();
    expect(parseDescription("x".repeat(501))).toBeNull();
    expect(parseDescription("👟 sneakers")).toBe("sneakers");
    expect(parseDescription("👟")).toBeNull();
    expect(parseDescription("café crème")).toBe("café crème");
  });
});

describe("toastMessage", () => {
  it("says what the brief says", () => {
    expect(toastMessage("saved", "2")).toBe("Pre-alert saved — 2 to go");
    expect(toastMessage("saved", "0")).toBe("All caught up");
    expect(toastMessage("done", null)).toBe("All caught up");
    expect(toastMessage("already", null)).toBe("Already pre-alerted");
    expect(toastMessage("<script>", null)).toBeNull();
    expect(toastMessage(null, null)).toBeNull();
  });
});

describe("deep link survives login", () => {
  it("allows the pick form and nothing off-site", () => {
    expect(safeNext("/dashboard/prealert/1395")).toBe("/dashboard/prealert/1395");
    expect(safeNext(encodeURIComponent("/dashboard/prealert/1395"))).toBe("/dashboard/prealert/1395");
    expect(safeNext("//evil.example/dashboard")).toBeNull();
    expect(safeNext("https://evil.example/dashboard")).toBeNull();
    expect(safeNext("/login")).toBeNull();
  });
});
