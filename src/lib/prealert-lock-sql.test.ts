import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { packageClearedSql, packageInvoicedSql, prealertLockedSql, prealertMatchedSql } from "./prealert-lock-sql";

const read = (p: string) => readFileSync(join(__dirname, p), "utf8").replace(/\r\n/g, "\n");

describe("prealert-lock-sql — the customer's lock (cleared OR invoiced)", () => {
  it("cleared = the package's shipment has a clearance row", () => {
    expect(packageClearedSql("pk")).toMatch(/swiftbox_shipment_clearance lcc ON lcc\.ship_no = lcs\.ship_no/);
    expect(packageClearedSql("pk")).toMatch(/lcs\.package_id = pk\.pk_id/);
  });

  it("invoiced = the package, its ship_no, or another package of its ship_no, always joined to the invoice header", () => {
    const sql = packageInvoicedSql("pk");
    expect(sql).toMatch(/lip\.pk_id = pk\.pk_id/);
    expect(sql).toMatch(/li2\.ship_no = lis\.ship_no/);
    expect(sql).toMatch(/lip2\.pk_id = lis3\.package_id/);
    expect((sql.match(/JOIN swiftbox_invoices/g) ?? []).length).toBe(3);
  });

  it("the link is the usual one: same user_id, TRIM'd non-blank tracking", () => {
    for (const sql of [prealertLockedSql("sp"), prealertMatchedSql("sp")]) {
      expect(sql).toMatch(/\.user_id = sp\.user_id/);
      expect(sql).toMatch(/LENGTH\(TRIM\(sp\.tracking_number\)\) > 0/);
      expect(sql).toMatch(/TRIM\(l[lm]p\.tracking\) = TRIM\(sp\.tracking_number\)/);
    }
  });

  it("refuses an unsafe alias", () => {
    expect(() => prealertLockedSql("sp; DROP")).toThrow();
    expect(() => packageInvoicedSql("1x")).toThrow();
  });
});

describe("customer pre-alert edit — wiring", () => {
  const server = read("prealert-edit-server.ts");
  const route = read("../app/api/prealerts/[id]/route.ts");

  it("every query on swiftbox_prealerts / swiftbox_prealert_files is scoped to the session's user", () => {
    const stmts = server.match(/`(?:SELECT|UPDATE|DELETE)[\s\S]*?`/g) ?? [];
    const own = stmts.filter((q) => /FROM swiftbox_prealerts|UPDATE swiftbox_prealerts|swiftbox_prealert_files WHERE/.test(q));
    expect(own.length).toBeGreaterThanOrEqual(4);
    for (const q of own) expect(q).toMatch(/user_id = :userId/);
  });

  it("writes are single-row, conditional and re-check the lock", () => {
    expect(server).toMatch(/UPDATE swiftbox_prealerts SET[\s\S]*?AND NOT \$\{LOCK_GUARD\}\s*\n\s*LIMIT 1/);
    expect(server).toMatch(/DELETE FROM swiftbox_prealerts[\s\S]*?AND NOT \$\{LOCK_GUARD\}\s*\n\s*LIMIT 1/);
  });

  it("never writes status or notes", () => {
    expect(server).not.toMatch(/SET[^`]*\b(status|notes)\s*=/);
  });

  it("the route answers 401 signed out on every method", () => {
    expect((route.match(/status: 401/g) ?? []).length).toBe(3);
  });

  it("customer audit rows use the shared vocabulary", () => {
    expect(server).toMatch(/CUSTOMER_EDIT_ACTION/);
    expect(server).toMatch(/CUSTOMER_CANCEL_ACTION/);
    expect(server).toMatch(/entity_type, entity_id, action, from_value, to_value, actor, logged_at, note/);
  });

  it("the invoice upload is under the same lock", () => {
    const files = read("prealert-file-server.ts");
    expect(files).toContain('${prealertLockedSql("sp")} AS locked');
    expect(files).toMatch(/Number\(own\.locked\) === 1\) return \{ ok: false, status: 409, error: LOCKED_MESSAGE \}/);
  });
});
