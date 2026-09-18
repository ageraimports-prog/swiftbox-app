/**
 * Invoice line arithmetic + billing badge — PORTED from the admin repo.
 *
 * SOURCE OF TRUTH lives in SwiftboxAdmin:
 *   - lib/invoice-line-qty.ts   → formatQtyRate, invoiceLineBasis
 *   - lib/billing-mode-core.ts  → shippedModeFromShipNo, billingModeOf,
 *                                 billingModeBadge, invoiceBillingBadge
 *
 * This app cannot import across repos, so the PURE halves are copied here
 * verbatim. They are pure on purpose: no `server-only`, no DB, so a client
 * component can render them.
 *
 * CHANGING THE ARITHMETIC WORDING HERE MEANS CHANGING IT THERE TOO. The whole
 * reason these functions exist in the admin is that the admin screen, the PDF
 * and the email all explain a charge with ONE definition — "10 lb × US$1.99",
 * "20% of freight", "Shipped AIR · Billed OCEAN". The customer app is now a
 * fourth reader of the same invoice; if this file drifts, the customer is told a
 * different story about the same money than the bill they were emailed.
 *
 * Also holds the invoice presentation bits shared by the list and detail
 * screens (status badge, TTD and date formatting), which are this app's own.
 */

/* ------------------------------------------------------------------ *
 * Ported from SwiftboxAdmin/lib/invoice-line-qty.ts
 * ------------------------------------------------------------------ */

/**
 * Operator-facing rendering: "10 lb × US$1.99", "20% of freight", "1 × minimum".
 * Percent-shaped lines read better as a percentage even though `rate` is stored
 * as the multiplier that makes the arithmetic work.
 */
export function formatQtyRate(l: {
  qty: number | null;
  unit: string | null;
  rate: number | null;
  lineType: string;
  currency: string;
}): string {
  if (l.qty == null || l.rate == null) return "";
  const cur = l.currency === "USD" ? "US$" : "TT$";
  const pctShaped =
    l.lineType === "fuel" ||
    l.lineType === "duty" ||
    l.lineType === "opt" ||
    l.lineType === "vat" ||
    l.lineType === "other";
  if (pctShaped) {
    const pct = l.rate * 100;
    return `${Math.round(pct * 100) / 100}% of ${cur}${l.qty.toFixed(2)}`;
  }
  if (l.unit === "min") return `minimum ${cur}${l.rate.toFixed(2)}`;
  const qtyText = Number.isInteger(l.qty)
    ? String(l.qty)
    : String(Number(l.qty.toFixed(4)));
  return `${qtyText} ${l.unit ?? ""} × ${cur}${l.rate.toFixed(2)}`
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What the invoice SHOWS beside a line — the customer-facing half of the
 * arithmetic, one definition for the screen, the PDF and the email.
 *
 * Three shapes, because three kinds of line justify themselves differently:
 *
 *  - FREIGHT (and anything else measured): "10 lb × US$1.99". The multiplication
 *    is the explanation.
 *  - A CUSTOMS line: its `basis` alone — "20% of CIF". The assessed base is the
 *    broker's, not ours, and reprinting it as "TT$574.60 × 0.2" invites a
 *    customer to check our arithmetic against a number we did not assess.
 *  - THE INSURANCE MINIMUM: "minimum US$2.00", with the overridden calculation
 *    as a note. qty × rate does NOT equal the declared-value arithmetic here —
 *    that is the whole point of a minimum — so the note carries what would have
 *    been charged instead of pretending the multiplication holds.
 *
 * `main` is the basis text for a hand-edited line ("adjusted by hand"), and empty
 * only for a pre-019 line that never carried one. Either way nothing is claimed.
 */
export function invoiceLineBasis(l: {
  qty: number | null;
  unit: string | null;
  rate: number | null;
  basis: string | null;
  lineType: string;
  currency: string;
}): { main: string; note: string | null } {
  const isCustoms =
    l.lineType === "duty" ||
    l.lineType === "opt" ||
    l.lineType === "vat" ||
    l.lineType === "other";
  if (isCustoms) return { main: (l.basis ?? "").trim(), note: null };
  // No stored multiplication. That is either a pre-019 line (basis null, and
  // nothing is claimed) or one an operator typed over, which carries the basis
  // "adjusted by hand" — worth printing, because a figure with no derivation is
  // a fact about the invoice, not a gap in it.
  if (l.qty == null || l.rate == null)
    return { main: (l.basis ?? "").trim(), note: null };
  if (l.unit === "min")
    return { main: formatQtyRate(l), note: (l.basis ?? "").trim() || null };
  // A stored basis beats the raw multiplication wherever one exists. Fuel reads
  // better as "20% of freight" than "20% of US$19.90", and insurance ABOVE the
  // minimum is worse than useless as a multiplication: its rate is 0.001, which
  // formats to "5000 USD × US$0.00" and looks like a zero-rate bug. Only freight
  // (basis null, rate in dollars) is genuinely clearer multiplied out.
  const basis = (l.basis ?? "").trim();
  if (basis) return { main: basis, note: null };
  return { main: formatQtyRate(l), note: null };
}

/* ------------------------------------------------------------------ *
 * Ported from SwiftboxAdmin/lib/billing-mode-core.ts
 * ------------------------------------------------------------------ */

export type BillingMode = "air" | "ocean";

/** How the goods ACTUALLY travelled — not how they are billed. */
export type ShippedMode = "AIR" | "SEA" | "OCEAN";

export function isBillingMode(v: unknown): v is BillingMode {
  return v === "air" || v === "ocean";
}

/** Whatever is stored, read as a mode. Anything unrecognised is air — the default. */
export function billingModeOf(v: unknown): BillingMode {
  return isBillingMode(v) ? v : "air";
}

/**
 * "Shipped AIR · Billed OCEAN" — the one place that sentence is built.
 *
 * Null for air, which is the default and needs no badge: a chip on every invoice
 * is not a signal. The two halves are deliberately both named, because the whole
 * point of the badge is that they DISAGREE — "Ocean" alone on an invoice for a
 * box that flew is the misreading this exists to prevent.
 */
export function billingModeBadge(
  shippedMode: string | null,
  billingMode: BillingMode
): string | null {
  const shipped = (shippedMode ?? "").trim().toUpperCase();
  if (billingMode === "air") return null; // the default — no badge, no noise
  return shipped ? `Shipped ${shipped} · Billed OCEAN` : "Billed OCEAN";
}

/**
 * THE ONE PLACE a shipped mode is derived. Null when the ship_no does not say.
 * Nothing in the schema records how a shipment travelled — the ship_no
 * (03-09-2026-AIR-1) is the record.
 */
export function shippedModeFromShipNo(shipNo: string | null): ShippedMode | null {
  const m = /-(AIR|SEA|OCEAN)-/i.exec(shipNo ?? "");
  return m ? (m[1].toUpperCase() as ShippedMode) : null;
}

/** The badge for one invoice, straight from the two fields that decide it. */
export function invoiceBillingBadge(
  shipNo: string | null,
  billingMode: unknown
): string | null {
  return billingModeBadge(shippedModeFromShipNo(shipNo), billingModeOf(billingMode));
}

/* ------------------------------------------------------------------ *
 * Shared invoice presentation — the list and the detail screen agree.
 * ------------------------------------------------------------------ */

export type InvoiceStatus = "unpaid" | "partial" | "paid";

export const STATUS_BADGE: Record<InvoiceStatus, { label: string; cls: string }> = {
  paid: {
    label: "Paid",
    cls: "bg-green/10 text-green border border-green/25",
  },
  partial: {
    label: "Partial",
    cls: "bg-amber-400/10 text-amber-300 border border-amber-400/25",
  },
  unpaid: {
    label: "Unpaid",
    cls: "bg-amber-400/10 text-amber-300 border border-amber-400/25",
  },
};

export function formatTtd(amount: number): string {
  return `TTD $${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Both a datetime (`created_at`, "2026-09-01 14:05:00") and a bare date
 * (`paid_date`, "2026-09-01") land here. A bare date gets an explicit local
 * midnight: "2026-09-01" alone parses as UTC, which in Trinidad (UTC-4) renders
 * as the day before — a payment made on the 1st would read "Aug 31".
 */
export function formatDate(ts: string): string {
  const t = ts.replace(" ", "T");
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T00:00:00` : t);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
