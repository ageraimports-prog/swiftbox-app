import PayPalOutcome from "../PayPalOutcome";

/** Back from PayPal after approving — the server captures and this page says what happened. */
export const dynamic = "force-dynamic";

export default function PayPalReturnPage() {
  return <PayPalOutcome mode="return" />;
}
