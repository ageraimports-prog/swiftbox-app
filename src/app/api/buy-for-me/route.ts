import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { createRequest, listMyRequests } from "@/lib/buy-for-me";

/** GET — the logged-in customer's Buy For Me requests, newest first. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ requests: await listMyRequests(session.id) });
}

/** POST — a new request: { items: [{ productUrl, qty, variant, priceSeen, note }], note }. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  try {
    const r = await createRequest(session, { items: body.items, note: body.note });
    if (!r.ok) return NextResponse.json({ error: r.error, itemErrors: r.itemErrors ?? {} }, { status: 400 });
    return NextResponse.json({ ok: true, id: r.id });
  } catch (e) {
    console.error("[buy-for-me] create failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "We couldn't send your request just now — please try again." }, { status: 500 });
  }
}
