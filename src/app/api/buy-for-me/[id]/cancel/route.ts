import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { cancelMyRequest } from "@/lib/buy-for-me";

/** POST — cancel the customer's own request, only while nothing has been paid. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await cancelMyRequest(session, Number(id));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  return NextResponse.json({ ok: true });
}
