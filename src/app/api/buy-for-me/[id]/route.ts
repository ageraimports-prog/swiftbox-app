import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getMyRequest } from "@/lib/buy-for-me";

/** GET — one of the customer's OWN requests (404 for anyone else's). Opening it clears the update badge. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const d = await getMyRequest(session.id, Number(id), { markSeen: true });
  if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ request: d });
}
