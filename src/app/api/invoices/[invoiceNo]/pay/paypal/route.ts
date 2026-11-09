import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requestPayPalOrder } from "@/lib/payments";

/**
 * "Pay with PayPal" for ONE issued invoice, scoped to the signed-in customer
 * (admin PAYPAL_PAYMENTS_PLAN.md). POST {terms:{version,accepted:true}} → the
 * PayPal approval link the page sends the customer to (a full-page redirect — no
 * popup, so it works in the installed app and the Android TWA). The admin decides
 * the amount and everything else; this route only proves who is asking and passes
 * the terms acceptance (IP + browser) along.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ invoiceNo: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { invoiceNo } = await params;
  if (!/^INV-\d+$/.test(invoiceNo)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { terms?: { version?: unknown; accepted?: unknown } };
  const terms = body.terms ?? {};
  if (terms.accepted !== true || typeof terms.version !== "string") {
    return NextResponse.json({ ok: false, error: "Please agree to the Terms and Refund Policy first.", code: "terms" }, { status: 400 });
  }
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = (forwarded ?? "").split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
  const r = await requestPayPalOrder({
    userId: session.id,
    invoiceNo,
    terms: { version: terms.version, accepted: true },
    ip: ip ? ip.slice(0, 45) : null,
    userAgent: (req.headers.get("user-agent") ?? "").slice(0, 255) || null,
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
