import { NextResponse } from "next/server";
import { sendPayPalReturn } from "@/lib/payments";

/**
 * The PayPal return / cancel pages call this (admin PAYPAL_PAYMENTS_PLAN.md).
 * POST {row, sig, token?, cancel?}. NO SESSION REQUIRED, on purpose: an installed
 * iOS web app or the Android TWA may come back from PayPal in a context without
 * our cookie. The signed link (HMAC by the admin over the row id) and PayPal's own
 * order token are the proof; the admin re-checks both before capturing, and the
 * answer carries only the outcome, the invoice number and the amount.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { row?: unknown; sig?: unknown; token?: unknown; cancel?: unknown };
  const rowId = Number(body.row);
  const sig = typeof body.sig === "string" && /^[0-9a-f]{32}$/.test(body.sig) ? body.sig : null;
  if (!Number.isInteger(rowId) || rowId <= 0 || !sig) return NextResponse.json({ outcome: "invalid", message: "This payment link is not valid." }, { status: 400 });
  const token = typeof body.token === "string" && /^[A-Z0-9]{1,36}$/.test(body.token) ? body.token : null;
  const r = await sendPayPalReturn({ rowId, sig, token, cancel: body.cancel === true });
  return NextResponse.json(r);
}
