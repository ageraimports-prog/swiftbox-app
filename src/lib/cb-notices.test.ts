import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { CB_NOTICE_COPY, CB_NOTICE_BUTTON, CB_NOTICE_URL } from "./cb-notices";
import {
  CB_ON_CONFIRM_TEXT, CB_ON_CONFIRM_TITLE, CB_OFF_QUESTION, CB_OFF_TOGETHER, CB_OFF_EACH, CB_UNDO_TEXT, CB_UNDO_MINUTES,
  CB_OFF_DONE_EACH, CB_OFF_DONE_TOGETHER,
} from "./consolidatedBilling";

// Consolidated Billing reminders + switch wording (admin CB_VERDICT_PLAN.md, 2026-11-27).
const BANNED = [
  /\b\d+\s+(package|parcel|item)s?\b/i,
  /miami|trinidad|tobago|piarco|warehouse|airport|hialeah/i,
  /shipment|flight|manifest|customs|clear(ed|ance)?\b|landed|arriv/i,
  /outstanding|still waiting|waiting (on|for)|missing|remaining/i,
];

describe("Consolidated Billing notices", () => {
  it("one button, the Send link", () => {
    expect(CB_NOTICE_BUTTON).toBe("Send my packages");
    expect(CB_NOTICE_URL).toBe("/dashboard?send=1#consolidated-billing");
  });
  it("no count, no place, no shipment detail, nothing outstanding", () => {
    const all = [
      ...Object.values(CB_NOTICE_COPY).flatMap((c) => [c.title, c.body]),
      CB_ON_CONFIRM_TEXT, CB_ON_CONFIRM_TITLE, CB_OFF_QUESTION, CB_OFF_TOGETHER, CB_OFF_EACH, CB_UNDO_TEXT, CB_OFF_DONE_EACH, CB_OFF_DONE_TOGETHER,
    ].join("\n");
    for (const re of BANNED) expect(all, re.source).not.toMatch(re);
  });
  it("undo lasts 10 minutes, like the admin's", () => expect(CB_UNDO_MINUTES).toBe(10));
  it("the switch-off answers are the admin's words", () => {
    expect(CB_OFF_TOGETHER).toBe("Deliver them together now");
    expect(CB_OFF_EACH).toBe("Deliver each as it comes");
  });
  it("every notice is the admin's own wording (when the admin checkout sits beside)", () => {
    const dir = process.env.SWIFTBOX_ADMIN_DIR || path.resolve(process.cwd(), "..", "SwiftboxAdmin");
    const f = path.join(dir, "lib", "cb-reminders-core.ts");
    if (!existsSync(f)) return;
    const admin = readFileSync(f, "utf8");
    if (!admin.includes("reminderCopy")) return; // an admin checkout without the reminders yet
    for (const [kind, c] of Object.entries(CB_NOTICE_COPY)) {
      expect(admin, `${kind} title`).toContain(c.title);
      // The body is the admin's lines joined with a space: every sentence must be there.
      for (const sentence of c.body.split(/(?<=\.)\s+/)) expect(admin, `${kind}: ${sentence}`).toContain(sentence.replace(/\s+$/, ""));
    }
  });
});
