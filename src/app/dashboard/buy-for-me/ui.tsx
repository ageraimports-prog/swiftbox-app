"use client";

import { formatMoney, type BfmStatus } from "@/lib/buy-for-me-core";
import { formatPct } from "@/lib/buy-for-me-quote";

/** The app's money style: "TTD $1,234.56" with "(USD $181.55)" beside it. */
export const ttd = (cents: number) => `TTD $${formatMoney(cents)}`;
export const usd = (cents: number) => `USD $${formatMoney(cents)}`;

export function formatDate(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const BADGE: Record<BfmStatus, string> = {
  submitted: "bg-mist/10 text-mist",
  quoted: "bg-amber-400/15 text-amber-300",
  payment_uploaded: "bg-sky-400/15 text-sky-300",
  paid: "bg-green/15 text-green",
  purchased: "bg-green/15 text-green",
  arrived_miami: "bg-green/15 text-green",
  unable_to_purchase: "bg-red-400/15 text-red-300",
  refunded: "bg-mist/10 text-mist",
  closed: "bg-mist/10 text-muted-dark",
  cancelled: "bg-mist/10 text-muted-dark",
  rejected: "bg-red-400/15 text-red-300",
};

export function StatusPill({ status, label }: { status: BfmStatus; label: string }) {
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE[status]}`}>{label}</span>;
}

export const card = "rounded-lg border border-mist/10 bg-ink-2 p-5";
export const greenButton =
  "flex items-center justify-center gap-1.5 rounded-xl bg-green px-5 py-3 text-sm font-bold text-ink transition-colors hover:bg-green-deep disabled:opacity-50";
export const ghostButton =
  "rounded-xl border border-mist/20 px-4 py-2.5 text-sm font-semibold text-mist transition-colors hover:bg-mist/5 disabled:opacity-50";

/** The one payment rule, word for word wherever money is mentioned. */
export const PAYMENT_ONLY_LINE = "We only accept bank deposit or bank transfer — no card, LINX, PayPal or cash on delivery.";

/**
 * The rules, stated plainly wherever someone could start or pay a request.
 * `feePct` is the admin setting bfm_fee_pct (the server falls back to 15); it is
 * never hardcoded here. While it loads the fee line is worded without a number.
 */
export function BuyForMeRules({ feePct }: { feePct: number | null }) {
  const fee = `Our service fee is ${feePct == null ? "a percentage" : `${formatPct(feePct)}%`} of the item value`;
  return (
    <ul className="space-y-1 text-xs text-muted-dark">
      <li>• Paid upfront — nothing is bought until our team confirms your payment.</li>
      <li>• {PAYMENT_ONLY_LINE}</li>
      <li>• {fee} (price × quantity) — it is not charged on US sales tax or US shipping.</li>
      <li>
        • One all-in quote: the item, US sales tax, US shipping to Miami, our service fee, freight to Trinidad, duty, OPT and
        VAT — all paid upfront.
      </li>
      <li>• A Swiftbox team member checks your items and sends you the quote before you pay anything.</li>
      <li>• If the actual weight or the customs assessment is higher than estimated, the difference may be charged on delivery.</li>
      <li>• Refunds are made by bank transfer only. We don&apos;t give credit of any kind.</li>
    </ul>
  );
}
