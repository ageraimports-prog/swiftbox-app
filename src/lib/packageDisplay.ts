/**
 * How a package is NAMED to the customer — one place, every screen.
 *
 * Customers know a package by what it is and by the carrier tracking number the
 * store gave them, not by our warehouse receipt (WR1193) or the Airdrop code
 * (SWF000009). So the headline is the description, the second line is the
 * tracking number, and the WR/SWF code is a small "Ref" that staff and WhatsApp
 * support still ask for. Display only: nothing here changes what is stored.
 *
 * Pure and client-safe. Tested in packageDisplay.test.ts.
 */

export type Carrier = "UPS" | "USPS" | "FedEx" | "Amazon";

/** Placeholders staff type when there is nothing to say. */
const JUNK = /^(x+|n\/?a|none|null|nil|unknown|unkown|unk|test|tbd|-+|\.+|\?+|0+)$/i;

/**
 * An item description as the customer sees it: trimmed, runs of whitespace
 * collapsed to one space, in FULL CAPITALS, so every package (Airdrop and Medley)
 * reads exactly as it does in the admin. "Phone cases" → "PHONE CASES",
 * "café" → "CAFÉ". Null when there is nothing worth showing (blank or a staff
 * placeholder such as "N/A"), so the screen can fall back to "Package".
 *
 * Item descriptions ONLY — never tracking numbers, names, addresses or account
 * codes. Display only: what is stored, and what a customer types into a
 * pre-alert, is never changed by this.
 */
export function formatDescription(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s || JUNK.test(s)) return null;
  return s.toUpperCase();
}

/**
 * The tracking field → the tracking numbers in it. Staff sometimes put several
 * in one field ("TBA…, TBA…") or a note ("DELIVERED"); spaces inside a number
 * are common. Each part is compacted (no whitespace) and upper-cased; parts
 * without a digit, or shorter than 5 characters, are not tracking numbers.
 */
export function splitTracking(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of String(raw ?? "").split(/[,;/|\n\r]+/)) {
    const c = part.replace(/\s+/g, "").toUpperCase();
    if (c.length >= 5 && /\d/.test(c) && !JUNK.test(c) && !out.includes(c)) out.push(c);
  }
  return out;
}

// ── Check digits. Each rule below was calibrated against the live tracking
//    numbers on 2026-09-30 before it was trusted: UPS 186/191 pass, FedEx 12-digit
//    25/27, FedEx 34-digit barcodes 131/131, USPS 22-digit 27/28, USPS 420+ZIP
//    barcodes 125/125. The failures are typos, and a typo gets no label. FedEx
//    15-digit (Ground) uses the same GS1 mod-10 as USPS; live had none to test.
//    UPS also matches its published sample, 1Z999AA10123456784. ──

const digits = (s: string) => s.split("").map(Number);

/** GS1 mod-10: weight 3 on the digit nearest the check digit, then 1, 3, … */
function mod10(num: string): boolean {
  const x = digits(num);
  const check = x.pop();
  let sum = 0;
  x.reverse().forEach((v, i) => (sum += i % 2 === 0 ? v * 3 : v));
  return (10 - (sum % 10)) % 10 === check;
}

function upsValid(t: string): boolean {
  let sum = 0;
  t.slice(2, 17)
    .split("")
    .forEach((c, i) => {
      const v = /\d/.test(c) ? Number(c) : (c.charCodeAt(0) - 63) % 10;
      sum += i % 2 === 1 ? v * 2 : v;
    });
  return (10 - (sum % 10)) % 10 === Number(t[17]);
}

function fedex12Valid(t: string): boolean {
  const w = [3, 1, 7, 3, 1, 7, 3, 1, 7, 3, 1];
  const x = digits(t);
  let sum = 0;
  for (let i = 0; i < 11; i++) sum += x[i] * w[i];
  return (sum % 11) % 10 === x[11];
}

const isUspsCore = (s: string) => /^9[1-5]\d+$/.test(s) && [20, 21, 22, 26].includes(s.length) && mod10(s);

type Read = { carrier: Carrier; number: string };

/**
 * One compacted tracking number → its carrier, and the number the CUSTOMER was
 * given. A warehouse scanner reads the whole label barcode, which for FedEx and
 * USPS wraps the customer's number in routing digits:
 *   FedEx  96 + 20 digits + the 12-digit tracking number (34 digits)
 *   USPS   420 + ZIP (5 or 9 digits) + the 22/26-digit tracking number
 * Those are unwrapped only when the inner number passes its check digit.
 * Null = not sure — no label, and the number is shown exactly as stored.
 */
function read(t: string): Read | null {
  if (/^1Z[0-9A-Z]{16}$/.test(t)) return upsValid(t) ? { carrier: "UPS", number: t } : null;
  if (/^TBA\d{5,}$/.test(t)) return { carrier: "Amazon", number: t };
  if (/^\d{12}$/.test(t)) return fedex12Valid(t) ? { carrier: "FedEx", number: t } : null;
  if (/^\d{15}$/.test(t)) return mod10(t) ? { carrier: "FedEx", number: t } : null;
  if (/^96\d{32}$/.test(t)) {
    const inner = t.slice(22);
    return fedex12Valid(inner) ? { carrier: "FedEx", number: inner } : null;
  }
  if (/^420\d+$/.test(t)) {
    const zip9 = t.slice(12);
    if (zip9.length === 22 && isUspsCore(zip9)) return { carrier: "USPS", number: zip9 };
    const zip5 = t.slice(8);
    if (isUspsCore(zip5)) return { carrier: "USPS", number: zip5 };
    return null;
  }
  if (/^\d+$/.test(t) && isUspsCore(t)) return { carrier: "USPS", number: t };
  return null;
}

/** The carrier of one tracking number, or null when not certain. */
export function detectCarrier(tracking: string | null | undefined): Carrier | null {
  const [first] = splitTracking(tracking);
  return first ? read(first)?.carrier ?? null : null;
}

/** One tracking number as the customer knows it, with its carrier when certain. */
export type TrackingNumber = { number: string; carrier: Carrier | null };

/** Every tracking number in the field, unwrapped where it is safe to. */
export function trackingNumbers(raw: string | null | undefined): TrackingNumber[] {
  return splitTracking(raw).map((t) => {
    const r = read(t);
    return r ? { number: r.number, carrier: r.carrier } : { number: t, carrier: null };
  });
}

/**
 * Middle-truncated for a card: "9400111899223197428490" fits, a 34-digit barcode
 * becomes "96320019…789012". The head and tail are what people compare.
 */
export function formatTracking(num: string, max = 22, head = 8, tail = 6): string {
  if (num.length <= max) return num;
  return `${num.slice(0, head)}…${num.slice(-tail)}`;
}

/** The Swiftbox reference: the Airdrop code when there is one, else the WR. */
export function shortRef(wr: string | null | undefined, packageCode?: string | null): string {
  return String(packageCode || wr || "").trim();
}

export type PackageIdentity = {
  /** Headline — the description, or "Package" (or the caller's fallback). */
  title: string;
  /** The first tracking number, or null. */
  tracking: TrackingNumber | null;
  /** How many more are in the same field. */
  moreTracking: number;
  /** "WR1193" / "SWF000009" — "" when neither exists. */
  ref: string;
};

/** Everything a package line needs, from the fields the API returns. */
export function packageIdentity(p: {
  commodities?: string | null;
  tracking?: string | null;
  wr?: string | null;
  packageCode?: string | null;
  fallbackTitle?: string | null;
}): PackageIdentity {
  const all = trackingNumbers(p.tracking);
  return {
    title: formatDescription(p.commodities) ?? (p.fallbackTitle || "Package"),
    tracking: all[0] ?? null,
    moreTracking: Math.max(0, all.length - 1),
    ref: shortRef(p.wr, p.packageCode),
  };
}

/** Several packages in one line: "Shoes + 2 more". */
export function packagesSummary(titles: string[]): string {
  if (titles.length === 0) return "";
  return titles.length === 1 ? titles[0] : `${titles[0]} + ${titles.length - 1} more`;
}
