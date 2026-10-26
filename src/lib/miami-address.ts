/**
 * The customer's Miami forwarding address — what they type at a US checkout.
 *
 * Must print identically to SwiftboxAdmin `lib/company.ts`
 * (`CUSTOMER_MIAMI_ADDRESS`, `customerAddressFields`) and the website's
 * `src/lib/miamiAddress.ts` (`miamiAddressFields`) — a disagreement is a lost
 * package, not a cosmetic diff.
 *
 * Shown as the labelled fields of a checkout form, in the order the form asks
 * for them (Brent, 2026-10-26): Full name, Address line 1 = the street,
 * Address line 2 = UNIT G36 SWIFT-####, City, State, ZIP, Country. Printing it
 * in label order (name, UNIT line, street…) made customers type the UNIT line
 * into Address line 1. ZIP is 33015, never ZIP+4.
 */

export const MIAMI_ADDRESS = {
  street: "6175 NW 167th ST STE G36",
  city: "Hialeah",
  state: "FL",
  zip: "33015",
  country: "United States",
} as const;

/**
 * Address line 2, formatted exactly as the website's `addressLine2` does it —
 * the unit repeated, then the account code: strip anything that is not a
 * digit, then pad to at least four. Airdrop asked for "UNIT G36" at the head of
 * the line on 2026-09-19; the separator is a HYPHEN ("SWIFT-0018"), set by
 * Brent 2026-09-24. `users.ac` is dirty on live (two digits wide, some with a
 * leading tab) and this is the field the warehouse matches a package on.
 */
export function addressLine2(ac: string): string {
  const digits = String(ac ?? "").replace(/\D+/g, "");
  return `UNIT G36 SWIFT-${digits.padStart(4, "0")}`;
}

export type AddressField = readonly [label: string, value: string];

/** The seven checkout fields, in form order, with their labels. */
export function miamiAddressFields(name: string, ac: string): AddressField[] {
  return [
    ["Full name", String(name ?? "").trim() || "Your full name"],
    ["Address line 1", MIAMI_ADDRESS.street],
    ["Address line 2", addressLine2(ac)],
    ["City", MIAMI_ADDRESS.city],
    ["State", MIAMI_ADDRESS.state],
    ["ZIP", MIAMI_ADDRESS.zip],
    ["Country", MIAMI_ADDRESS.country],
  ];
}

/** "Address line 1: 6175 NW 167th ST STE G36", one field per line — what "Copy all" puts on the clipboard. */
export function miamiAddressText(name: string, ac: string): string {
  return miamiAddressFields(name, ac)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}
