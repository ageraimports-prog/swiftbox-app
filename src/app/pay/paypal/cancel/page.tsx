import PayPalOutcome from "../PayPalOutcome";

/** The customer pressed Cancel at PayPal — nothing was charged; the attempt is marked cancelled. */
export const dynamic = "force-dynamic";

export default function PayPalCancelPage() {
  return <PayPalOutcome mode="cancel" />;
}
