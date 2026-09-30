/**
 * Pick-to-prealert — the pure pieces: display labels, input parsing, the demo
 * account and the customer-facing messages. No DB (see prealert-pick-server.ts).
 * Tested in prealert-pick.test.ts.
 */

/** Shown when a package is closed, not the customer's, or doesn't exist. */
export const CLOSED_MESSAGE =
  "This package is already on its way to customs, so it can't be pre-alerted here. WhatsApp us on (868) 609-3000 and we'll sort it out.";
export const WHATSAPP_URL = "https://wa.me/18686093000";

/**
 * THE GOOGLE PLAY REVIEW DEMO ACCOUNT — member #0364. Same two-way match as the
 * admin's lib/play-demo.ts: the account's email OR the demo tracking prefix.
 * Its packages show in the list so reviewers can see the feature, but a submit
 * is a dry run: nothing is ever written for it.
 */
export const PLAY_DEMO_EMAIL = "demo@swiftboxtt.com";
export const PLAY_DEMO_TRACKING_PREFIX = "DEMO0364";

/** SQL: TRUE for a package of the demo account. Literals only. */
export function isPlayDemoSql(alias = "p"): string {
  if (!/^[a-z][a-z0-9_]*$/i.test(alias)) throw new Error("Invalid SQL alias");
  return `(${alias}.user_id IN (SELECT id FROM users WHERE email = '${PLAY_DEMO_EMAIL}') OR ${alias}.tracking LIKE '${PLAY_DEMO_TRACKING_PREFIX}%')`;
}

/** A package that is waiting for its pre-alert, as the app shows it. */
export type PickPackage = {
  pkId: number;
  tracking: string;
  carrier: string | null;
  weightLb: string;
  arrivedLabel: string;
  warehouse: "Hialeah" | "Medley";
};

const JUNK = /^(x+|n\/?a|none|null|unknown|unkown|unk|test|-+|\.+|\?+|\d+)$/i;
const KEEP: Record<string, string> = { FEDEX: "FedEx", SHEIN: "SHEIN", USPS: "USPS", DHL: "DHL", UPS: "UPS" };

/**
 * mod_packages has no carrier column; `shipper` holds the merchant or carrier as
 * entered ("AMAZON"). Same rule as the admin's carrierLabel
 * (lib/prealert-nudge-core.ts) so the app and the email say the same thing.
 */
export function carrierLabel(shipper: string | null | undefined): string | null {
  const s = String(shipper ?? "").replace(/\s+/g, " ").trim();
  if (!s || JUNK.test(s)) return null;
  const out = s
    .split(" ")
    .map((w) => {
      const core = w.replace(/[.,]+$/, "");
      if (KEEP[core.toUpperCase()]) return KEEP[core.toUpperCase()] + w.slice(core.length);
      if (/^[A-Z]{4,}$/.test(core)) return core[0] + core.slice(1).toLowerCase() + w.slice(core.length);
      return w;
    })
    .join(" ");
  return out.length > 40 ? `${out.slice(0, 39).trimEnd()}…` : out;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09-29" → "Sep 29, 2026". A date, not an instant — no time zone applies. */
export function arrivalDateLabel(isoDate: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate ?? ""));
  if (!m) return String(isoDate ?? "");
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}, ${m[1]}` : String(isoDate);
}

/** Best-available weight in lb: the scale weight when recorded (> 0), else the whole-pound weight. */
export function weightLabel(weight: unknown, actualWeight: unknown): string {
  const actual = Number(actualWeight);
  if (Number.isFinite(actual) && actual > 0) return String(Math.round(actual * 100) / 100);
  const whole = Number(weight);
  return Number.isFinite(whole) && whole > 0 ? String(whole) : "0";
}

/** The admin's lib/warehouse.ts rule: an Airdrop id means Hialeah, otherwise Medley. */
export function warehouseLabel(hasAirdropId: unknown): "Hialeah" | "Medley" {
  return Number(hasAirdropId) === 1 ? "Hialeah" : "Medley";
}

export const VALUE_MAX_USD = 99999999.99;

/**
 * The value the customer typed, in USD → a number with at most 2 decimals, or
 * null. Accepts "12.50", "12.5", ".5", "$12.50", "1,234.50". Rejects zero,
 * negatives, a third decimal and anything over DECIMAL(10,2).
 */
export function parseValueUsd(raw: unknown): number | null {
  const s = String(raw ?? "").trim().replace(/^\$\s*/, "").replace(/,(?=\d{3}(\D|$))/g, "");
  if (!/^(\d{1,8}(\.\d{0,2})?|\.\d{1,2})$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0 || n > VALUE_MAX_USD) return null;
  return Math.round(n * 100) / 100;
}

export const DESCRIPTION_MAX = 500;

/**
 * "What's inside?" → trimmed text, or null when empty / too long. Characters
 * outside the Basic Multilingual Plane (emoji) are dropped: the bridge talks
 * 3-byte utf8 and live MySQL isn't strict, so one would silently cut the
 * stored text off at that point.
 */
export function parseDescription(raw: unknown): string | null {
  const s = String(raw ?? "").replace(/[\u{10000}-\u{10FFFF}]/gu, "").replace(/\s+/g, " ").trim();
  if (!s || s.length > DESCRIPTION_MAX) return null;
  return s;
}

/** "3 packages" / "1 package" */
export function packagesPhrase(n: number): string {
  return `${n} package${n === 1 ? "" : "s"}`;
}

/** The toast a page shows from its `?toast=` / `?left=` query. */
export function toastMessage(toast: string | null, left: string | null): string | null {
  if (toast === "saved") {
    const n = Number.parseInt(String(left ?? ""), 10);
    return Number.isFinite(n) && n > 0 ? `Pre-alert saved — ${n} to go` : "All caught up";
  }
  if (toast === "done") return "All caught up";
  if (toast === "already") return "Already pre-alerted";
  if (toast === "filefail") return "Pre-alert saved, but the invoice didn't upload — WhatsApp it to us on (868) 703-3600.";
  if (toast === "alreadyfile") return "Already pre-alerted — the invoice wasn't attached. WhatsApp it to us on (868) 703-3600.";
  return null;
}
