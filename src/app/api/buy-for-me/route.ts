import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createRequest, getBfmFeePct, listMyRequests } from "@/lib/buy-for-me";
import { isBfmEnabled } from "@/lib/bfm-switch";
import { BFM_PAUSED_MESSAGE } from "@/lib/bfm-switch-core";

/**
 * GET — the logged-in customer's Buy For Me requests, newest first. Works while
 * Buy For Me is paused: a customer can always see their EXISTING requests.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [requests, feePct] = await Promise.all([listMyRequests(session.id), getBfmFeePct()]);
  return NextResponse.json({ requests, feePct });
}

/**
 * POST — a new request: { items: [{ productUrl, qty, variant, priceSeen, note }], note }.
 * 403 with the paused message while Buy For Me is switched off (src/lib/bfm-switch-core.ts).
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isBfmEnabled())) return NextResponse.json({ error: BFM_PAUSED_MESSAGE, paused: true }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  try {
    const r = await createRequest(session, { items: body.items, note: body.note });
    if (!r.ok) {
      if (r.paused) return NextResponse.json({ error: r.error, paused: true }, { status: 403 });
      return NextResponse.json({ error: r.error, itemErrors: r.itemErrors ?? {} }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: r.id });
  } catch (e) {
    console.error("[buy-for-me] create failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "We couldn't send your request just now — please try again." }, { status: 500 });
  }
}
