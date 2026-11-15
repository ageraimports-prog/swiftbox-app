import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { fetchPayAllOffer, requestPayPalOrder } from "@/lib/payments";

/**
 * "Pay all open invoices" with PayPal, as ONE order (admin CARD_DISCOUNT_PLAN.md),
 * scoped to the signed-in customer.
 *   GET  → { payAll } — null unless 2+ invoices can be paid together right now
 *   POST {terms:{version,accepted:true}} → the PayPal approval link for one order
 *        covering every open invoice (the admin picks them, works out the total and
 *        any discount; this route only proves who is asking).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // the admin builds the PayPal order (up to 50 s on a slow bridge)

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await fetchPayAllOffer(session.id));
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { terms?: { version?: unknown; accepted?: unknown } };
  const terms = body.terms ?? {};
  if (terms.accepted !== true || typeof terms.version !== "string") {
    return NextResponse.json({ ok: false, error: "Please agree to the Terms and Refund Policy first.", code: "terms" }, { status: 400 });
  }
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = (forwarded ?? "").split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  const r = await requestPayPalOrder({
    userId: session.id,
    invoiceNos: "all",
    terms: { version: terms.version, accepted: true },
    ip: ip ? ip.slice(0, 45) : null,
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 255) || null,
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
