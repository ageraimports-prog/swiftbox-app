/**
 * Consolidated Billing — the PURE arithmetic the app needs, ported from
 * SwiftboxAdmin `lib/consolidated-billing-core.ts` (keep the two in step). The
 * bill only ever ADDS UP figures its child invoices already carry, in integer
 * cents; nothing here prices anything (R10).
 */

import { HOLD_DAYS } from "./consolidatedBilling";

const DAY_MS = 86_400_000;
const TT_OFFSET_MS = -4 * 3_600_000; // Trinidad & Tobago: UTC-4, no DST

/** A UTC DATETIME from MySQL ("YYYY-MM-DD HH:MM:SS") → Date. */
export function utcDate(raw: string | Date | null | undefined): Date | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return raw;
  const s = String(raw).trim().replace(" ", "T");
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function ttDayNumber(d: Date): number {
  return Math.floor((d.getTime() + TT_OFFSET_MS) / DAY_MS);
}

/** "Day X of 20" — day 1 is the first Miami entry's calendar day in T&T. */
export function windowDay(firstEntryAt: Date, now: Date): number {
  return Math.min(HOLD_DAYS, Math.max(1, ttDayNumber(now) - ttDayNumber(firstEntryAt) + 1));
}

/** "Sat 17 Oct" in Trinidad time. */
export function ttDateLabel(d: Date): string {
  return d.toLocaleDateString("en-TT", { timeZone: "America/Port_of_Spain", weekday: "short", day: "numeric", month: "short" });
}

/**
 * R7 — every released member is SHOWN at the stage of the last to arrive (the
 * least advanced), with that arrival's date. Raw ship_status 0–5 only (the app
 * never sees the admin's derived "Cleared").
 */
export function groupDisplay(members: { shipStatus: number | null; awaitingDate: string | null }[]): {
  shipStatus: number | null;
  awaitingDate: string | null;
} {
  const known = members.filter((m) => m.shipStatus != null);
  if (known.length === 0) return { shipStatus: null, awaitingDate: null };
  const min = Math.min(...known.map((m) => Number(m.shipStatus)));
  const latest = known
    .map((m) => m.awaitingDate)
    .filter((d): d is string => !!d)
    .sort()
    .pop() ?? null;
  return { shipStatus: min, awaitingDate: latest };
}

export type ChildLine = {
  lineType: string; description: string; amountTtd: number; basis?: string | null;
  /** Display only: the line's unrounded TT$ (US$ amount × the invoice's roe) — see reconcileChildLines. */
  exactTtd?: number;
};

export type CustomsItem = {
  description: string;
  declaredValueUsd: number;
  dutyTtd: number;
  optTtd: number;
  vatTtd: number;
  otherTaxTtd: number;
};

export type PackageSection = {
  freightTtd: number;
  fuelTtd: number;
  insuranceTtd: number;
  otherChargesTtd: number;
  items: CustomsItem[];
  subtotalTtd: number;
  creditsTtd: number;
};

const cents = (n: number) => Math.round((Number(n) || 0) * 100);
const fromCents = (c: number) => c / 100;

// Ported from SwiftboxAdmin lib/consolidated-billing-core.ts (2026-10-18) — keep identical.
const SHIPPING_LINE_TYPES = ["freight", "fuel", "insurance"];

/**
 * DISPLAY ONLY — make one child invoice's lines add up to its own stored total.
 *
 * Why it is needed: the Consolidated Billing pricing (cb-group-pricing
 * rewriteShipping) stores the header shipping_ttd as ONE conversion of
 * (freight + fuel + insurance) US$ to TT$, but each line's amount_ttd as its OWN
 * conversion. Each rounding is honest, but the three rounded lines can differ
 * from the rounded sum by a cent or two — so a bill that adds up its children's
 * lines (108.25 + 21.62 + 13.58 + 312.85 = 456.30) disagreed with the sum of the
 * children's totals (456.33), which is what the customer pays.
 *
 * The rule: the invoice's total is right and is never touched. The difference
 * (total − Σ lines, in cents) is the shipping rounding, so it is settled on the
 * invoice's positive shipping lines, one cent at a time: to the line whose own
 * rounding lost the most (`exactTtd`, the US$ × roe it was converted from), so
 * each line ends as close as possible to its true conversion; without exact
 * figures, largest line first. No line moves by more than a cent. Only a
 * difference rounding can explain is settled: at most ⌊(n+1)/2⌋ cents for n
 * shipping lines (each conversion is off by < ½ cent, the header by < ½ cent).
 * Anything larger — or an invoice with no shipping line — is returned as it is,
 * so a real disagreement still shows (billTotals.reconciles = false).
 * Nothing is written: stored amounts and totals stay exactly as they are.
 */
export function reconcileChildLines<L extends ChildLine>(lines: L[], totalTtd: number): L[] {
  const residual = cents(totalTtd) - lines.reduce((n, l) => n + cents(l.amountTtd), 0);
  if (residual === 0) return lines;
  const candidates = lines
    .map((l, i) => ({ i, c: cents(l.amountTtd), exact: l.exactTtd }))
    .filter((x) => SHIPPING_LINE_TYPES.includes(lines[x.i].lineType) && x.c > 0);
  const withExact = candidates.every((x) => x.exact != null && Number.isFinite(x.exact));
  // Positive residual: the most under-rounded line first; negative: the most over-rounded.
  const lost = (x: { c: number; exact?: number }) => (residual > 0 ? 1 : -1) * ((x.exact as number) * 100 - x.c);
  const shipping = candidates.sort((a, b) =>
    (withExact ? lost(b) - lost(a) : 0) || b.c - a.c || a.i - b.i);
  if (shipping.length === 0 || Math.abs(residual) > Math.floor((shipping.length + 1) / 2)) return lines;
  const out = lines.slice();
  const step = residual > 0 ? 1 : -1;
  for (let k = 0; k < Math.abs(residual); k++) {
    const x = shipping[k % shipping.length];
    out[x.i] = { ...out[x.i], amountTtd: fromCents(cents(out[x.i].amountTtd) + step) };
  }
  return out;
}

function isCustomsOther(l: ChildLine): boolean {
  return l.basis === "as assessed by customs" || l.description.trim().toLowerCase() === "other taxes";
}

/** One package's block, from its invoice's lines. An ocean invoice has no OPT line. */
export function packageSection(lines: ChildLine[], items: { description: string; declaredValueUsd: number }[]): PackageSection {
  let freight = 0, fuel = 0, insurance = 0, duty = 0, opt = 0, vat = 0, otherTax = 0, otherCharges = 0, credits = 0;
  for (const l of lines) {
    const c = cents(l.amountTtd);
    if (c < 0) { credits += c; continue; }
    switch (l.lineType) {
      case "freight": freight += c; break;
      case "fuel": fuel += c; break;
      case "insurance": insurance += c; break;
      case "duty": duty += c; break;
      case "opt": opt += c; break;
      case "vat": vat += c; break;
      default:
        if (isCustomsOther(l)) otherTax += c;
        else otherCharges += c;
    }
  }
  const described = items.length > 0 ? items : [{ description: "Goods", declaredValueUsd: 0 }];
  return {
    freightTtd: fromCents(freight),
    fuelTtd: fromCents(fuel),
    insuranceTtd: fromCents(insurance),
    otherChargesTtd: fromCents(otherCharges),
    items: described.map((it, i) => ({
      description: it.description,
      declaredValueUsd: Number(it.declaredValueUsd) || 0,
      dutyTtd: i === 0 ? fromCents(duty) : 0,
      optTtd: i === 0 ? fromCents(opt) : 0,
      vatTtd: i === 0 ? fromCents(vat) : 0,
      otherTaxTtd: i === 0 ? fromCents(otherTax) : 0,
    })),
    subtotalTtd: fromCents(freight + fuel + insurance + duty + opt + vat + otherTax + otherCharges),
    creditsTtd: fromCents(credits),
  };
}

export type BillStatus = "unpaid" | "partial" | "paid" | "house";

export type BillTotals = {
  houseValueTtd?: number;
  chargesTtd: number;
  creditsTtd: number;
  totalTtd: number;
  paidTtd: number;
  dueTtd: number;
  status: BillStatus;
};

/** R10: Σ children to the cent. The total is Σ total_ttd itself, never a re-addition. */
export function billTotals(children: { houseAccount?: boolean; totalTtd: number; amountPaid: number; lines: ChildLine[] }[]): BillTotals {
  let total = 0, paid = 0, due = 0, credits = 0, houseValue = 0;
  for (const c of children) {
    const t = cents(c.totalTtd);
    const p = cents(c.amountPaid);
    total += t;
    paid += p;
    if (c.houseAccount) houseValue += t;
    else if (t - p > 0) due += t - p;
    for (const l of c.lines) { const a = cents(l.amountTtd); if (a < 0) credits += a; }
  }
  return {
    houseValueTtd: fromCents(houseValue),
    chargesTtd: fromCents(total - credits),
    creditsTtd: fromCents(credits),
    totalTtd: fromCents(total),
    paidTtd: fromCents(paid),
    dueTtd: fromCents(due),
    status: children.length > 0 && children.every((c) => c.houseAccount) ? "house" : due === 0 ? "paid" : paid > 0 ? "partial" : "unpaid",
  };
}
