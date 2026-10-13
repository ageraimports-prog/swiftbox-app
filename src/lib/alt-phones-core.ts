/**
 * A customer's OTHER phone numbers — `users.alt_phones` (migration 053) — the
 * PURE rules, no DB, so they run standalone: `npx tsx scripts/test-alt-phones.ts`.
 *
 * The website's signup route keeps a CODE-IDENTICAL copy in
 * `src/lib/altPhones.ts` (it is where the WhatsApp bot's `alt_phones` arrive).
 * Change both together.
 *
 * STORAGE. One VARCHAR(64), comma-separated, already normalised:
 * "868-745-9527,868-321-0000". At most MAX_ALT_PHONES numbers (3: the WhatsApp
 * number when the customer chose a different main number, plus two they
 * volunteered — Brent, 2026-10-06). NULL when there are none.
 *
 * NORMALISING. The same shape the bot writes for the main phone:
 *   7 digits, 868 + 7, 1 868 + 7      → "868-XXX-XXXX"
 *   any other 10 digits (+1 area code) → "+1XXXXXXXXXX"
 *   11 digits starting 1               → "+1XXXXXXXXXX"
 *   12–15 digits                       → "+<digits>" (international)
 *   anything else (under 7, 8–9 digits, letters only) → not a phone number.
 * A non-T&T number is kept, never dropped: when a customer on a foreign
 * WhatsApp number gives a local "best mobile", their WhatsApp number becomes an
 * alternate and must still be recognised (lib/whatsapp-identity.ts reads it).
 *
 * CLEANING (`cleanAltPhones`). Normalise each, drop what isn't a phone number,
 * drop duplicates and anything equal to the main number, keep the first
 * MAX_ALT_PHONES in the order given. It never throws: a bad extra number must
 * never fail a signup.
 */

export const MAX_ALT_PHONES = 3;

/** The column is VARCHAR(64); 3 × "+123456789012345" + 2 commas = 50. */
export const ALT_PHONES_MAX_LENGTH = 64;

/** One number in the stored form, or null when it isn't a phone number. */
export function normalizeAltPhone(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const digits = String(raw).replace(/\D+/g, "");
  let local: string | null = null;
  if (digits.length === 7) local = digits;
  else if (digits.length === 10 && digits.startsWith("868")) local = digits.slice(3);
  else if (digits.length === 11 && digits.startsWith("1868")) local = digits.slice(4);
  if (local) return `868-${local.slice(0, 3)}-${local.slice(3)}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length >= 12 && digits.length <= 15) return `+${digits}`;
  return null;
}

/**
 * The numbers inside a main-phone value, normalised, so an alternate equal to
 * any of them is dropped. users.phone can hold two numbers ("377 5561/345 6774")
 * and is free text, so it is split the same way lib/whatsapp-identity-core.ts
 * splits it.
 */
function mainPhoneNumbers(main: unknown): Set<string> {
  const out = new Set<string>();
  const text = String(main ?? "").replace(/\(?\s*(?:ext\.?|extension|x)\s*\d+\s*\)?/gi, " ");
  for (const part of text.split(/[\/,;|&]|\bor\b/i)) {
    const d = part.replace(/\D+/g, "");
    const halves = d.length === 14 ? [d.slice(0, 7), d.slice(7)] : [d];
    for (const h of halves) {
      const n = normalizeAltPhone(h);
      if (n) out.add(n);
    }
  }
  return out;
}

/**
 * Accepts an array (the bot's JSON), a stored comma string, or anything else
 * (ignored). Returns the clean list — possibly empty — and never throws.
 */
export function cleanAltPhones(input: unknown, main: unknown = "", max: number = MAX_ALT_PHONES): string[] {
  let items: unknown[];
  if (Array.isArray(input)) items = input;
  else if (typeof input === "string") items = input.split(/[,;\n]+/);
  else return [];
  const skip = mainPhoneNumbers(main);
  const out: string[] = [];
  for (const item of items) {
    if (out.length >= max) break;
    const n = normalizeAltPhone(item);
    if (!n || skip.has(n) || out.includes(n)) continue;
    out.push(n);
  }
  return out;
}

/** What goes into the column: comma-joined, or null for none. */
export function formatAltPhones(list: string[]): string | null {
  const s = list.join(",");
  return s ? s.slice(0, ALT_PHONES_MAX_LENGTH) : null;
}

/** The stored column back as a list (display, Call buttons). */
export function parseAltPhones(stored: unknown): string[] {
  return String(stored ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The owner's edit: unlike the bot path, a number the owner typed that isn't
 * a phone number is REFUSED with a message rather than dropped silently, so a
 * typo isn't lost without them knowing. Duplicates and copies of the main
 * number are still dropped quietly.
 */
export function validateAltPhonesInput(
  raw: string[],
  main: unknown
): { ok: true; list: string[] } | { ok: false; error: string } {
  const typed = raw.map((s) => String(s ?? "").trim()).filter(Boolean);
  for (const t of typed) {
    if (!normalizeAltPhone(t)) return { ok: false, error: `"${t.slice(0, 30)}" isn't a phone number.` };
  }
  const list = cleanAltPhones(typed, main, Number.MAX_SAFE_INTEGER);
  if (list.length > MAX_ALT_PHONES) {
    return { ok: false, error: `At most ${MAX_ALT_PHONES} other numbers can be saved.` };
  }
  return { ok: true, list };
}
