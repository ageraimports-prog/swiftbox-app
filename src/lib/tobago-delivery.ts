/**
 * Tobago door delivery — the wording and the "is this a Tobago customer?" test.
 * Client-safe (pure: no DB, no server imports).
 *
 * THE RULE (Brent, 25 Oct 2026):
 *  - Door delivery in Trinidad is included. Tobago door delivery is TT$30 per
 *    delivery.
 *  - With Consolidated Billing (free, switched on by the customer) every package
 *    in the group goes to Tobago in ONE delivery for that single TT$30, up to
 *    50 lb combined. Over 50 lb a higher Tobago delivery fee applies — NEVER
 *    state an amount for it.
 *  - A package delivered on its own still pays TT$30.
 *  - Never name the delivery partner, what the partner charges Swiftbox, or that
 *    Swiftbox subsidises the fee. No Tobago delivery-time promise anywhere
 *    ("3–7 business days" is Miami → Trinidad only).
 * Locked by tobago-delivery.test.ts.
 */

/** Small UI spaces (the Consolidated Billing card). Brent's wording, verbatim. */
export const TOBAGO_DELIVERY_SHORT =
  "Door delivery in Trinidad included. Tobago TT$30 per delivery; Consolidated Billing puts all your packages in one (up to 50 lb)";

/** Info screens (the Consolidated Billing questions). Brent's wording, verbatim. */
export const TOBAGO_DELIVERY_LONG =
  "Door delivery in Trinidad is included. Tobago is TT$30 per delivery, and with Consolidated Billing (free) all your packages go in one delivery for that TT$30, up to 50 lb combined. Over 50 lb, a higher Tobago delivery fee applies.";

/** The question the long wording answers in the Consolidated Billing FAQ (Tobago customers only). */
export const TOBAGO_DELIVERY_FAQ_Q = "How much is delivery to Tobago?";

/** Label for a Tobago delivery charge on an invoice. */
export const TOBAGO_DELIVERY_LINE_LABEL = "Tobago delivery (per delivery)";

/** "Trinidad and Tobago" / "Trinidad & Tobago" / "Republic of …" is the country, not the island. */
const COUNTRY = /\b(republic\s+of\s+)?trinidad\s*(and|&)\s*tobago\b/gi;

/**
 * Tobago towns — the admin gazetteer's Tobago entries (SwiftboxAdmin
 * lib/zones-core.ts). Only used when users.zone does not already decide.
 */
const TOBAGO_TOWNS = [
  "scarborough", "signal hill", "carnbee", "crown point", "canaan", "mason hall",
  "bon accord", "roxborough", "plymouth", "buccoo", "charlotteville", "speyside",
];

/** Stored zones that already say Trinidad (canonical names and the CEN/SOE/SOW codes). */
const TRINIDAD_ZONES = new Set(["central", "north east", "north west", "south east", "south west", "cen", "soe", "sow"]);

function mentionsTobago(text: string): boolean {
  const t = text.replace(COUNTRY, " ").toLowerCase().replace(/\s+/g, " ");
  if (/\btobago\b/.test(t)) return true;
  return TOBAGO_TOWNS.some((town) => new RegExp(`\\b${town}\\b`).test(t));
}

/**
 * Is this customer delivered in Tobago? users.zone decides when it is set
 * ("Tobago"/"TOBAGO" → yes; a Trinidad zone → no). A blank or non-zone value
 * (EAST/WEST, "office", noise) falls back to the address and town text.
 */
export function isTobagoCustomer(u: {
  zone?: string | null;
  city?: string | null;
  address?: string | null;
}): boolean {
  const zone = String(u.zone ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (zone === "tobago") return true;
  if (TRINIDAD_ZONES.has(zone)) return false;
  return mentionsTobago(`${u.city ?? ""} ${u.address ?? ""}`);
}

/**
 * The label an invoice shows for a charge line. A line the office typed about
 * Tobago (e.g. "Tobago surcharge") reads TOBAGO_DELIVERY_LINE_LABEL, so the
 * customer never sees a partner name or internal wording. Display only — the
 * amount is untouched.
 */
export function customerChargeLabel(description: string): string {
  const t = String(description ?? "").replace(COUNTRY, " ");
  return /\btobago\b/i.test(t) ? TOBAGO_DELIVERY_LINE_LABEL : description;
}
