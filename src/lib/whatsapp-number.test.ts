import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Swiftbox's WhatsApp (and phone) number is (868) 609-3000. (868) 703-3600 is
 * WRONG and shipped once on the pre-alert screen; this sweep keeps it out of
 * every source file, in every spelling (703-3600, 7033600, 18687033600, ...).
 */
const SRC = path.join(__dirname, "..");
const RETIRED = /703[\s.-]?3600|795[\s.-]?3300|703[\s.-]?0069/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(tsx?|css|json|md)$/.test(entry.name) && full !== __filename) out.push(full);
  }
  return out;
}

describe("WhatsApp number", () => {
  it("no source file carries a retired number", () => {
    const hits = walk(SRC).filter((f) => RETIRED.test(fs.readFileSync(f, "utf8")));
    expect(hits).toEqual([]);
  });
});
