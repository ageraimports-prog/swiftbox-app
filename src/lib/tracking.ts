/**
 * THE rule for "is this the same parcel?" between a customer's pre-alert and a
 * received package (Brent, 2026-11-04). PURE, no I/O.
 * CODE-IDENTICAL in SwiftboxApp src/lib/tracking.ts — change both together.
 *
 * WHY: the Miami warehouse / Airdrop stores a USPS parcel as the whole IMpb
 * barcode: "420" + the destination ZIP (5 digits) or ZIP+4 (9 digits) + the real
 * number. Customers pre-alert the real number. Exact-string matching never linked
 * the two (Shastri Maharaj #1167: 9339589677069924172208 vs WR1560
 * 420330159339589677069924172208), so the pre-alert stayed "Awaiting" and the
 * "please pre-alert" reminders kept going out.
 *
 * THE RULE, both halves, ALWAYS same customer (the caller scopes on user_id; a
 * match never crosses customers):
 *   1. Equal after clean-up (trackingKey): upper-case, no spaces or dashes, and an
 *      all-digit value starting 420 and longer than 22 loses "420"+ZIP or
 *      "420"+ZIP+4 — whichever leaves 20–22 digits starting with 9. The two can
 *      never both qualify: they differ by 4 digits and the window is 3 wide.
 *   2. Fallback: one value ends with the other and the shorter is 18+ characters.
 *      This is what links USPS's 26-digit 92… numbers, which rule 1 leaves whole.
 *
 * Nothing is stored: there is no key column, so the link stays computed at read
 * time, in JS by `trackingsMatch` and in SQL by `trackingMatchSql`. The two MUST
 * agree — scripts/verify-tracking-dev.ts runs both over the same pairs on MySQL.
 */

/** Below this a shared ending could be chance (a 12-digit FedEx number etc.). */
export const TRACKING_SUFFIX_MIN = 18;

/** Upper-case, every space and dash removed. Blank stays blank. */
export function normalizeTracking(raw: unknown): string {
  return String(raw ?? "").toUpperCase().replace(/[\s-]/g, "");
}

/** A normalised value without its IMpb 420+ZIP routing prefix, when it has one. */
export function stripImpbPrefix(norm: string): string {
  if (!/^420\d+$/.test(norm) || norm.length <= 22) return norm;
  for (const zipDigits of [5, 9]) {
    const rest = norm.slice(3 + zipDigits);
    if (/^9\d{19,21}$/.test(rest)) return rest;
  }
  return norm;
}

/** The key two values must share to be the same parcel under rule 1. */
export function trackingKey(raw: unknown): string {
  return stripImpbPrefix(normalizeTracking(raw));
}

/** The same parcel? Rule 1 or the fallback. Blank never matches. */
export function trackingsMatch(a: unknown, b: unknown): boolean {
  const x = normalizeTracking(a);
  const y = normalizeTracking(b);
  if (!x || !y) return false;
  if (x === y || stripImpbPrefix(x) === stripImpbPrefix(y)) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= TRACKING_SUFFIX_MIN && long.endsWith(short);
}

/**
 * What to look for when someone searches by a tracking number: the text as typed
 * is searched by the caller; these are the extra forms, so "9434-6501 …" and a
 * scanned barcode both find a package stored either way. Empty when the term is
 * not tracking-shaped (a name, a WR#).
 */
export function trackingSearchForms(term: unknown): string[] {
  const norm = normalizeTracking(term);
  if (!/^[A-Z0-9]{10,}$/.test(norm) || !/\d{6}/.test(norm)) return [];
  return [...new Set([norm, stripImpbPrefix(norm)])];
}

const SQL_OPERAND = /^(?:[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?|:[a-z_][a-z0-9_]*)$/i;

function operand(x: string): string {
  if (!SQL_OPERAND.test(x)) throw new Error("Invalid SQL operand");
  return x;
}

/**
 * Spaces and dashes gone; TRIM is implied. Always compared as utf8_general_ci (the
 * bridge's connection collation, case-insensitive): mod_packages is latin1, and a
 * function over a bound parameter against a latin1 column is MySQL's "Illegal mix
 * of collations".
 */
function cleanedSql(x: string): string {
  return `REPLACE(REPLACE(CONVERT(${x} USING utf8), ' ', ''), '-', '')`;
}

function keySql(n: string): string {
  return `CASE WHEN ${n} REGEXP '^420[0-9]{5}9[0-9]{19,21}$' THEN SUBSTRING(${n}, 9)
               WHEN ${n} REGEXP '^420[0-9]{9}9[0-9]{19,21}$' THEN SUBSTRING(${n}, 13)
               ELSE ${n} END`;
}

/**
 * `trackingsMatch` as a SQL condition between two columns (or a column and a
 * :named parameter). Blank never matches. The CALLER scopes it to one customer
 * (user_id = user_id); nothing here may be used across customers. A plain value
 * against a barcode is the suffix branch; the last branch is two barcodes of one
 * parcel with different ZIP forms. MySQL 5.6-safe: no CTEs, one correlated row.
 */
export function trackingMatchSql(a: string, b: string): string {
  const A = cleanedSql(operand(a));
  const B = cleanedSql(operand(b));
  const m = TRACKING_SUFFIX_MIN;
  return `(LENGTH(${A}) > 0 AND LENGTH(${B}) > 0 AND (
         ${A} = ${B}
      OR (LENGTH(${A}) >= ${m} AND LENGTH(${B}) > LENGTH(${A}) AND RIGHT(${B}, LENGTH(${A})) = ${A})
      OR (LENGTH(${B}) >= ${m} AND LENGTH(${A}) > LENGTH(${B}) AND RIGHT(${A}, LENGTH(${B})) = ${B})
      OR (${A} LIKE '420%' AND ${B} LIKE '420%' AND (${keySql(A)}) = (${keySql(B)}))))`;
}
