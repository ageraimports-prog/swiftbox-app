/**
 * How a stored `swiftbox_invoice_payments.method` is shown to the customer.
 * Never render the raw value. Mirrors PAYMENT_METHOD_LABEL +
 * SYSTEM_PAYMENT_METHOD_LABEL in SwiftboxAdmin lib/payment-methods.ts (the ONE
 * vocabulary) — keep the two in step.
 */
const LABEL: Record<string, string> = {
  cash: "Cash",
  linx: "LINX",
  card: "Credit card",
  transfer: "Bank transfer",
  wire: "Wire",
  cheque: "Cheque",
  other: "Other",
  paypal: "PayPal",
  // Online card payment through Stripe (admin STRIPE_PAYMENTS_PLAN.md, 2026-11-02).
  stripe: "Card (online)",
  // System-only (never picked by staff): the landed invoice of a Buy For Me
  // package, settled from the all-in amount the customer paid upfront.
  bfm_prepaid: "Paid in advance (Buy For Me)",
  // System-only: the discount for paying online (admin CARD_DISCOUNT_PLAN.md). Not money —
  // it settles the rest of the invoice beside the PayPal payment.
  online_discount: "Online payment discount",
};

/** The online-payment discount rows' method (admin ONLINE_DISCOUNT_METHOD). */
export const ONLINE_DISCOUNT_METHOD = "online_discount";

export function paymentLabel(method: string | null | undefined): string {
  const m = String(method ?? "").trim().toLowerCase();
  return LABEL[m] ?? "Payment";
}
