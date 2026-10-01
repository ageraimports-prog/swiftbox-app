/**
 * Buy For Me — reading a STORED quote row for display (pure, no server-only).
 *
 * The admin freezes every figure when it sends a quote (BUY_FOR_ME_PLAN.md §10,
 * migration 043). This app never recalculates anything: it reads the row and
 * shows it. Two shapes of row exist:
 *
 *   - ALL-IN (043 has run and the admin filled the Trinidad part):
 *     grand_total_ttd is set, and it is what the customer pays.
 *     grand_total_ttd = total_ttd + courier_ttd + customs_ttd.
 *   - PURCHASE-ONLY (legacy, or 043 has not run yet so the columns are missing):
 *     grand_total_ttd is NULL or absent, and the customer pays total_ttd.
 *
 * Rows are read with `SELECT *`, so a missing 043 column is simply `undefined`
 * here and reads as NULL — nothing ever names a 043 column in SQL.
 */
import { decimalToCents, decimalToCentsOrNull } from "./buy-for-me-core";

export type BfmAllIn = {
  /** Estimated weight the quote was based on, in lb (null if the admin left it blank). */
  estWeightLb: number | null;
  /** US$ freight, fuel and insurance to Trinidad — the caption under the courier line. */
  freightUsdCents: number;
  fuelUsdCents: number;
  insuranceUsdCents: number;
  /** TT$ freight + fuel + insurance, as frozen (courier_ttd). */
  courierTtdCents: number;
  dutyTtdCents: number;
  optTtdCents: number;
  vatTtdCents: number;
  otherTtdCents: number;
  customsTtdCents: number;
  /** What the customer pays for this quote. */
  grandTotalTtdCents: number;
};

type Row = Record<string, unknown>;

const isBlank = (v: unknown) => v === null || v === undefined || v === "";

/** The frozen Trinidad part of a quote row, or null for a purchase-only quote. */
export function allInFromRow(q: Row): BfmAllIn | null {
  if (isBlank(q.grand_total_ttd)) return null;
  const c = (k: string) => decimalToCents(q[k]);
  const w = isBlank(q.est_weight_lb) ? null : Number(q.est_weight_lb);
  return {
    estWeightLb: w != null && Number.isFinite(w) ? w : null,
    freightUsdCents: c("freight_usd"),
    fuelUsdCents: c("fuel_usd"),
    insuranceUsdCents: c("insurance_usd"),
    courierTtdCents: c("courier_ttd"),
    dutyTtdCents: c("duty_ttd"),
    optTtdCents: c("opt_ttd"),
    vatTtdCents: c("vat_ttd"),
    otherTtdCents: c("other_ttd"),
    customsTtdCents: c("customs_ttd"),
    grandTotalTtdCents: c("grand_total_ttd"),
  };
}

/** What the customer pays for one quote: grand_total_ttd when set, else total_ttd. */
export function amountDueTtdCents(q: Row): number {
  return decimalToCentsOrNull(q.grand_total_ttd) ?? decimalToCents(q.total_ttd);
}

/** "3.5" for 3.50, "12" for 12.00 — the estimated weight in the all-in sentence. */
export function formatWeightLb(lb: number): string {
  return String(Math.round(lb * 100) / 100);
}

/** The sentence under every all-in quote. */
export function allInNotice(estWeightLb: number | null): string {
  const basis = estWeightLb != null && estWeightLb > 0 ? `, based on an estimated weight of ${formatWeightLb(estWeightLb)} lb` : "";
  return `This price includes delivery to Trinidad, duty and VAT${basis}. If the actual weight or the customs assessment is higher, the difference may be charged on delivery.`;
}

/** The fee % setting as shown in copy: 15 → "15", 12.5 → "12.5". Fallback 15 when the setting is unreadable. */
export const BFM_FEE_PCT_FALLBACK = 15;
export function parseFeePct(raw: unknown): number {
  if (isBlank(raw)) return BFM_FEE_PCT_FALLBACK;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) && n >= 0 && n <= 50 ? n : BFM_FEE_PCT_FALLBACK;
}
export function formatPct(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * Titles for the events this app shows in a request's history. The base titles
 * come from BFM_EVENT_DEFS (the identical copy of the admin's core); these are
 * kinds the admin added for the all-in flow. An unknown kind never shows its raw
 * code — it falls back to a plain sentence.
 */
export const EXTRA_EVENT_TITLES: Record<string, string> = {
  landed_invoiced: "Arrived — delivery already paid",
  extra_charges: "Additional charges on arrival",
};
export const UNKNOWN_EVENT_TITLE = "Update on your request";

export function bfmEventTitle(kind: unknown, base: Record<string, { title: string }>): string {
  const k = String(kind ?? "");
  if (Object.prototype.hasOwnProperty.call(base, k)) return base[k].title;
  if (Object.prototype.hasOwnProperty.call(EXTRA_EVENT_TITLES, k)) return EXTRA_EVENT_TITLES[k];
  return UNKNOWN_EVENT_TITLE;
}
