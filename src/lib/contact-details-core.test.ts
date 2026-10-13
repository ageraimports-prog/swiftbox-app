import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { contactWrite, detailsFromRow, normalizeAddressLabel, type StoredContact } from "@/lib/contact-details-core";

/**
 * The Account page's delivery details (admin migration 062 + 053): primary +
 * optional alternate address and phone. Alternates are optional; blank clears
 * them; an untouched legacy value is kept as stored.
 */

const stored: StoredContact = {
  phone: "868-745-9527",
  alt_phones: "868-321-0000,+13055551234",
  address: "12 Main Rd",
  city: "Chaguanas",
  alt_address: null,
  alt_city: null,
  address_label: null,
  alt_address_label: null,
};
const same = { phone: "868-745-9527", altPhone: "868-321-0000", address: "12 Main Rd", city: "Chaguanas", addressLabel: "", altAddress: "", altCity: "", altAddressLabel: "" };

describe("contact details", () => {
  it("reads the first alternate as 'second phone' and keeps the rest", () => {
    const d = detailsFromRow(stored, true);
    expect(d.altPhone).toBe("868-321-0000");
    expect(d.otherPhones).toEqual(["+13055551234"]);
  });

  it("labels are Home / Work / Other only", () => {
    expect(normalizeAddressLabel("work")).toBe("Work");
    expect(normalizeAddressLabel("Office")).toBeNull();
  });

  it("nothing changed → only the labels are written", () => {
    const w = contactWrite(same, stored, true);
    expect(w).toEqual({ ok: true, set: { address_label: null, alt_address_label: null } });
  });

  it("adds a second address with a label; blank zone so it is derived", () => {
    const w = contactWrite({ ...same, addressLabel: "home", altAddress: " 5 Frederick St ", altCity: "Port of Spain", altAddressLabel: "Work" }, stored, true);
    expect(w).toEqual({
      ok: true,
      set: { address_label: "Home", alt_address: "5 Frederick St", alt_city: "Port of Spain", alt_zone: null, alt_address_label: "Work" },
    });
  });

  it("half a second address is refused, both empty clears it", () => {
    expect(contactWrite({ ...same, altAddress: "5 Frederick St" }, stored, true).ok).toBe(false);
    const withAlt = { ...stored, alt_address: "5 Frederick St", alt_city: "Port of Spain", alt_address_label: "Work" };
    const w = contactWrite(same, withAlt, true);
    expect(w.ok && w.set.alt_address).toBeNull();
    expect(w.ok && w.set.alt_address_label).toBeNull();
  });

  it("the main address can change but not be emptied; its stale zone is blanked", () => {
    expect(contactWrite({ ...same, address: "", city: "" }, stored, true).ok).toBe(false);
    const w = contactWrite({ ...same, address: "3 High St", city: "San Fernando" }, stored, true);
    expect(w.ok && w.set).toMatchObject({ address: "3 High St", city: "San Fernando", zone: "" });
  });

  it("phones are normalised; a non-number is refused; second phone is optional", () => {
    const w = contactWrite({ ...same, phone: "+1 (868) 555 1234", altPhone: "" }, stored, true);
    expect(w.ok && w.set.phone).toBe("868-555-1234");
    expect(w.ok && w.set.alt_phones).toBe("+13055551234");
    expect(contactWrite({ ...same, altPhone: "12345" }, stored, true).ok).toBe(false);
    expect(contactWrite({ ...same, phone: "" }, stored, true).ok).toBe(false);
  });

  it("an untouched legacy free-text phone never blocks a save", () => {
    const legacy = { ...stored, phone: "377 5561/345 6774", alt_phones: null };
    const w = contactWrite({ ...same, phone: "377 5561/345 6774", altPhone: "868-999-0000" }, legacy, true);
    expect(w.ok && w.set.phone).toBeUndefined();
    expect(w.ok && w.set.alt_phones).toBe("868-999-0000");
  });

  it("before migration 062 the alternate address and labels are never written", () => {
    const w = contactWrite({ ...same, altAddress: "5 Frederick St", altCity: "Port of Spain" }, stored, false);
    expect(w).toEqual({ ok: true, set: {} });
  });

  it("alt-phones-core.ts is the admin's file, byte for byte, when the admin checkout sits beside this one", () => {
    const admin = path.join(__dirname, "..", "..", "..", "SwiftboxAdmin", "lib", "alt-phones-core.ts");
    if (!fs.existsSync(admin)) return;
    const adminSrc = fs.readFileSync(admin, "utf8");
    if (!adminSrc.includes("MAX_ALT_PHONES")) return; // an old checkout without 053
    expect(fs.readFileSync(path.join(__dirname, "alt-phones-core.ts"), "utf8").replace(/\r\n/g, "\n")).toBe(adminSrc.replace(/\r\n/g, "\n"));
  });
});
