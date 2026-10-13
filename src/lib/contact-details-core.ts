import { cleanAltPhones, normalizeAltPhone, parseAltPhones } from "@/lib/alt-phones-core";

/**
 * The customer's own delivery details on the Account page — PRIMARY and
 * optional ALTERNATE address (Home/Work/Other labels) and PRIMARY and optional
 * ALTERNATE phone (admin migration 062 + 053). PURE: tests in
 * contact-details-core.test.ts.
 *
 * The label and cleaning rules copy the admin's lib/customer-addresses-core.ts;
 * alt-phones-core.ts is a CODE-IDENTICAL copy of the admin's
 * lib/alt-phones-core.ts. Change them together.
 *
 * Rules (Brent, 2026-10-13): the alternates are OPTIONAL — blank clears them,
 * never an error. The primary address and phone can be changed but not
 * emptied (deliveries need them). A value the customer didn't touch is kept
 * exactly as stored, so an old free-text phone ("377 5561/345 6774") never
 * blocks saving an unrelated change.
 */

export const ADDRESS_LABELS = ["Home", "Work", "Other"] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

export function normalizeAddressLabel(raw: unknown): AddressLabel | null {
  const s = String(raw ?? "").trim().toLowerCase();
  return ADDRESS_LABELS.find((l) => l.toLowerCase() === s) ?? null;
}

export function cleanAddressText(raw: unknown, max: number): string {
  if (typeof raw !== "string" && typeof raw !== "number") return "";
  return String(raw).replace(/\s+/g, " ").trim().slice(0, max);
}

/** What the screen shows and sends back. */
export type ContactDetails = {
  phone: string;
  /** the FIRST alternate number ("" when none) */
  altPhone: string;
  /** further stored alternates, shown read-only and always kept */
  otherPhones: string[];
  address: string;
  city: string;
  addressLabel: AddressLabel | "";
  altAddress: string;
  altCity: string;
  altAddressLabel: AddressLabel | "";
  /** false until migration 062 has run — the alternate address is hidden */
  altAddressReady: boolean;
};

export type StoredContact = {
  phone: string | null;
  alt_phones: string | null;
  address: string | null;
  city: string | null;
  alt_address?: string | null;
  alt_city?: string | null;
  address_label?: string | null;
  alt_address_label?: string | null;
};

export function detailsFromRow(r: StoredContact, ready: boolean): ContactDetails {
  const phone = String(r.phone ?? "").trim();
  const alts = cleanAltPhones(parseAltPhones(r.alt_phones), phone);
  return {
    phone,
    altPhone: alts[0] ?? "",
    otherPhones: alts.slice(1),
    address: String(r.address ?? "").trim(),
    city: String(r.city ?? "").trim(),
    addressLabel: normalizeAddressLabel(r.address_label) ?? "",
    altAddress: String(r.alt_address ?? "").trim(),
    altCity: String(r.alt_city ?? "").trim(),
    altAddressLabel: normalizeAddressLabel(r.alt_address_label) ?? "",
    altAddressReady: ready,
  };
}

/** The columns to write. Only keys present are written. */
export type ContactWrite = Record<string, string | null>;

/**
 * The form → the users columns to UPDATE, or an error in the customer's words.
 * `ready` = migration 062 has run (else the alternate address / labels are
 * neither read nor written).
 */
export function contactWrite(
  input: Record<string, unknown>,
  stored: StoredContact,
  ready: boolean
): { ok: true; set: ContactWrite } | { ok: false; error: string } {
  const set: ContactWrite = {};
  const storedPhone = String(stored.phone ?? "").trim();

  // Primary phone — unchanged → kept as stored; changed → normalised.
  const phoneIn = String(input.phone ?? "").trim();
  let main = storedPhone;
  if (phoneIn !== storedPhone) {
    if (!phoneIn) return { ok: false, error: "Please enter your phone number." };
    const n = normalizeAltPhone(phoneIn);
    if (!n) return { ok: false, error: `"${phoneIn.slice(0, 30)}" doesn't look like a phone number.` };
    main = n;
    set.phone = n;
  }

  // Alternate phone — optional; replaces the first stored alternate, keeps the rest.
  const altIn = String(input.altPhone ?? "").trim();
  let first = "";
  if (altIn) {
    const n = normalizeAltPhone(altIn);
    if (!n) return { ok: false, error: `"${altIn.slice(0, 30)}" doesn't look like a phone number.` };
    first = n;
  }
  const rest = parseAltPhones(stored.alt_phones).slice(1);
  const alts = cleanAltPhones([first, ...rest].filter(Boolean), main);
  const altsStored = cleanAltPhones(parseAltPhones(stored.alt_phones), storedPhone);
  if (alts.join(",") !== altsStored.join(",") || set.phone !== undefined) set.alt_phones = alts.join(",") || null;

  // Primary address — street and town both required; unchanged → untouched.
  const address = cleanAddressText(input.address, 100);
  const city = cleanAddressText(input.city, 50);
  if (address !== String(stored.address ?? "").trim() || city !== String(stored.city ?? "").trim()) {
    if (!address || !city) return { ok: false, error: "Please enter your street address and town." };
    set.address = address;
    set.city = city;
    // The stored zone described the OLD address. Blank it so the delivery zone
    // is worked out from the new town, never a wrong van from a stale one.
    set.zone = "";
  }

  if (ready) {
    set.address_label = normalizeAddressLabel(input.addressLabel);
    const altAddress = cleanAddressText(input.altAddress, 100);
    const altCity = cleanAddressText(input.altCity, 50);
    if (!!altAddress !== !!altCity) {
      return { ok: false, error: "For your second address, please enter both the street and the town — or leave both empty." };
    }
    if (altAddress !== String(stored.alt_address ?? "").trim() || altCity !== String(stored.alt_city ?? "").trim()) {
      set.alt_address = altAddress || null;
      set.alt_city = altCity || null;
      set.alt_zone = null;
    }
    set.alt_address_label = altAddress ? normalizeAddressLabel(input.altAddressLabel) : null;
  }
  return { ok: true, set };
}
