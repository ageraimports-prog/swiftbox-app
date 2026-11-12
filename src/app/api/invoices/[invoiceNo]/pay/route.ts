import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { fetchPayOffer, fetchPayStatus, requestPaymentIntent } from "@/lib/payments";

/**
 * "Pay now" for ONE issued invoice, scoped to the signed-in customer.
 *   GET  ?offer=1                → can it be paid, for how much, terms links
 *   GET  ?paymentIntentId=pi_…   → did it go through (the admin re-checks Stripe)
 *   POST {terms:{version,accepted:true}} → a PaymentIntent (client secret + publishable key)
 * The admin decides everything (amount, eligibility, idempotency); this route
 * only proves who is asking. The customer's IP and browser go with the terms
 * acceptance so the record on the payment is complete.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function badNo(invoiceNo: string) {
  return !/^INV-\d+$/.test(invoiceNo);
}

export async function GET(req: Request, { params }: { params: Promise<{ invoiceNo: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { invoiceNo } = await params;
  if (badNo(invoiceNo)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const url = new URL(req.url);
  const pi = url.searchParams.get("paymentIntentId");
  if (pi) {
    if (!/^pi_[A-Za-z0-9_]+$/.test(pi)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const st = await fetchPayStatus(session.id, pi);
    if (!st) return NextResponse.json({ error: "Couldn't check the payment yet." }, { status: 502 });
    return NextResponse.json(st);
  }
  return NextResponse.json(await fetchPayOffer(session.id, invoiceNo));
}

export async function POST(req: Request, { params }: { params: Promise<{ invoiceNo: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { invoiceNo } = await params;
  if (badNo(invoiceNo)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let body: { terms?: { version?: unknown; accepted?: unknown } } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const terms = body.terms ?? {};
  if (terms.accepted !== true || typeof terms.version !== "string") {
    return NextResponse.json({ ok: false, error: "Please agree to the Terms and Refund Policy first.", code: "terms" }, { status: 400 });
  }
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = (forwarded ?? "").split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  const r = await requestPaymentIntent({
    userId: session.id,
    invoiceNo,
    terms: { version: terms.version, accepted: true },
    ip: ip ? ip.slice(0, 45) : null,
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 255) || null,
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
