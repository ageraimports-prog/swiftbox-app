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

export type ChildLine = { lineType: string; description: string; amountTtd: number; basis?: string | null };

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

export type BillStatus = "unpaid" | "partial" | "paid";

export type BillTotals = {
  chargesTtd: number;
  creditsTtd: number;
  totalTtd: number;
  paidTtd: number;
  dueTtd: number;
  status: BillStatus;
};

/** R10: Σ children to the cent. The total is Σ total_ttd itself, never a re-addition. */
export function billTotals(children: { totalTtd: number; amountPaid: number; lines: ChildLine[] }[]): BillTotals {
  let total = 0, paid = 0, due = 0, credits = 0;
  for (const c of children) {
    const t = cents(c.totalTtd);
    const p = cents(c.amountPaid);
    total += t;
    paid += p;
    if (t - p > 0) due += t - p;
    for (const l of c.lines) { const a = cents(l.amountTtd); if (a < 0) credits += a; }
  }
  return {
    chargesTtd: fromCents(total - credits),
    creditsTtd: fromCents(credits),
    totalTtd: fromCents(total),
    paidTtd: fromCents(paid),
    dueTtd: fromCents(due),
    status: due === 0 ? "paid" : paid > 0 ? "partial" : "unpaid",
  };
}
