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
};

export function paymentLabel(method: string | null | undefined): string {
  const m = String(method ?? "").trim().toLowerCase();
  return LABEL[m] ?? "Payment";
}
