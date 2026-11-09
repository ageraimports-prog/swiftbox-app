import { cleanAltPhones, normalizeAltPhone, parseAltPhones } from "./alt-phones-core";

/**
 * The "Bill to" block of an invoice (Brent, 2026-11-05) — the ONE place that turns
 * a customer's stored address and phone numbers into what an invoice prints. PURE,
 * display only: no invoice figure reads it. `npx tsx scripts/test-invoice-bill-to.ts`.
 *
 * CODE-IDENTICAL in admin lib/invoice-bill-to-core.ts and app
 * src/lib/invoice-bill-to-core.ts — change both together.
 *
 * Read from the customer record when the invoice is rendered (no snapshot), so an
 * invoice already issued gains the block and shows the customer's current details.
 *
 * WHAT THE COLUMNS HOLD: users.address (free text, may hold "street, area"),
 * users.city (the town), users.phone (free text, may hold two numbers), and
 * users.alt_phones (migration 053, comma-separated). users.state and users.zip are
 * empty on every member, so the area can only come from the address's own commas.
 */

export type BillToAudience = "customer" | "admin";

export type BillToFacts = {
  name: string;
  /** Already worked out by the caller's swiftCode ("SWIFT-0123"); no real number → dropped. */
  swiftCode: string;
  address: unknown;
  city: unknown;
  phone: unknown;
  altPhones: unknown;
};

/** `tel` is null for a number we can't dial (admin only: shown as typed, no link). */
export type BillToPhone = { display: string; tel: string | null };

export type BillToView = {
  name: string;
  swiftCode: string;
  addressLines: string[];
  phones: BillToPhone[];
};

/** Customer-facing output prints the primary phone and one more. */
const CUSTOMER_PHONES = 2;

/** "null", "N/A", "-", "0" and friends are not address parts. */
const NOT_A_PART = /^(null|undefined|n\/?a|none|nil|not applicable|[-.,#0\s]*)$/i;

function cleanPart(raw: unknown): string {
  if (typeof raw !== "string" && typeof raw !== "number") return "";
  const s = String(raw).replace(/\s+/g, " ").trim();
  return NOT_A_PART.test(s) ? "" : s;
}

function holdsWords(line: string, words: string): boolean {
  const escaped = words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(line);
}

/**
 * Street / area / town, one per line: the address's own commas and line breaks
 * split it, empty and junk parts go, a repeated part prints once, and the town is
 * added unless the address already names it.
 */
export function billToAddressLines(address: unknown, city: unknown): string[] {
  const lines: string[] = [];
  const add = (part: string) => {
    if (part && !lines.some((l) => l.toLowerCase() === part.toLowerCase())) lines.push(part);
  };
  String(typeof address === "string" || typeof address === "number" ? address : "")
    .split(/[\r\n,]+/)
    .forEach((p) => add(cleanPart(p)));
  const town = cleanPart(city);
  if (town && !lines.some((l) => holdsWords(l, town))) add(town);
  return lines;
}

/** 000-0000, 111-1111… a form was filled in, not a phone number given. */
function isPlaceholderNumber(digits: string): boolean {
  return /^(\d)\1{6}$/.test(digits.slice(-7));
}

/** "868-123-4567" (normalizeAltPhone's shape) → how it prints and how it dials. */
export function formatBillToPhone(normalized: string): BillToPhone {
  const local = /^868-(\d{3})-(\d{4})$/.exec(normalized);
  if (local) return { display: `(868) ${local[1]}-${local[2]}`, tel: `+1868${local[1]}${local[2]}` };
  const nanp = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(normalized);
  if (nanp) return { display: `+1 (${nanp[1]}) ${nanp[2]}-${nanp[3]}`, tel: normalized };
  return { display: normalized, tel: normalized };
}

/** Every number in the free-text main phone: normalised, plus what could not be read. */
function mainPhoneParts(field: unknown): { numbers: string[]; unread: string[] } {
  const text = String(field ?? "").replace(/\(?\s*(?:ext\.?|extension|x)\s*\d+\s*\)?/gi, " ");
  const numbers: string[] = [];
  const unread: string[] = [];
  for (const part of text.split(/[\/,;|&]|\bor\b/i)) {
    const digits = part.replace(/\D+/g, "");
    if (!digits) continue;
    const pieces = digits.length === 14 ? [digits.slice(0, 7), digits.slice(7)] : [digits];
    for (const piece of pieces) {
      if (isPlaceholderNumber(piece)) continue;
      const n = normalizeAltPhone(piece);
      if (n) numbers.push(n);
      else if (piece.length >= 5) unread.push(part.trim());
    }
  }
  return { numbers, unread };
}

/**
 * The primary phone first, then users.alt_phones (never a copy of the primary).
 * Customer-facing: two at most, and only numbers we could read. Admin: every
 * stored number; one we can't read shows as typed so "No phone on file" is never
 * said of a customer who has something on file.
 */
export function billToPhones(phone: unknown, altPhones: unknown, audience: BillToAudience): BillToPhone[] {
  const { numbers, unread } = mainPhoneParts(phone);
  const alternates = cleanAltPhones(parseAltPhones(altPhones), phone).filter(
    (n) => !isPlaceholderNumber(n.replace(/\D+/g, ""))
  );
  const seen = new Set<string>();
  const out: BillToPhone[] = [];
  for (const n of [...numbers, ...alternates]) {
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(formatBillToPhone(n));
  }
  if (audience === "customer") return out.slice(0, CUSTOMER_PHONES);
  return [...out, ...unread.map((display) => ({ display, tel: null }))];
}

/** Everything a Bill to block shows. An empty field simply has no line. */
export function billToView(f: BillToFacts, audience: BillToAudience): BillToView {
  const swift = String(f.swiftCode ?? "").trim();
  return {
    name: String(f.name ?? "").replace(/\s+/g, " ").trim(),
    swiftCode: /[1-9]/.test(swift) ? swift : "",
    addressLines: billToAddressLines(f.address, f.city),
    phones: billToPhones(f.phone, f.altPhones, audience),
  };
}

/** The lines under the name, in print order — what the PDF, print and email list. */
export function billToTextLines(v: BillToView): string[] {
  return [...(v.swiftCode ? [v.swiftCode] : []), ...v.addressLines, ...v.phones.map((p) => p.display)];
}
