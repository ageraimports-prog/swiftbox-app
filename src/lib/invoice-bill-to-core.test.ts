import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { billToTextLines, billToView } from "./invoice-bill-to-core";

describe("the invoice Bill to block", () => {
  const facts = { name: "Savatri Test", swiftCode: "SWIFT-0170", address: "12 Main Rd, Longdenville", city: "Chaguanas", phone: "8681234567", altPhones: "868-765-4321" };

  it("prints the code, the address line by line and both phones", () => {
    expect(billToTextLines(billToView(facts, "customer"))).toEqual([
      "SWIFT-0170", "12 Main Rd", "Longdenville", "Chaguanas", "(868) 123-4567", "(868) 765-4321",
    ]);
  });

  it("prints nothing for what is missing", () => {
    const v = billToView({ name: "Bare", swiftCode: "—", address: null, city: "null", phone: "", altPhones: null }, "customer");
    expect(billToTextLines(v)).toEqual([]);
  });

  it("is byte-identical to the admin's copy when it sits beside this checkout", () => {
    const admin = process.env.BILL_TO_SIBLING || path.resolve(process.cwd(), "..", "SwiftboxAdmin", "lib", "invoice-bill-to-core.ts");
    if (!existsSync(admin)) return;
    const norm = (f: string) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
    expect(norm(path.resolve(process.cwd(), "src/lib/invoice-bill-to-core.ts"))).toBe(norm(admin));
  });
});
