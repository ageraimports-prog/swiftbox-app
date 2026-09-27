import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getCbBill } from "@/lib/consolidated-billing";

/** GET — one of the customer's issued Consolidated Bills, per package and per item. */
export async function GET(_req: Request, { params }: { params: Promise<{ billNo: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { billNo } = await params;
  // The user_id filter inside getCbBill is the ownership check: someone else's
  // bill 404s rather than leaking that it exists.
  const bill = await getCbBill(session.id, decodeURIComponent(billNo));
  if (!bill) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ bill });
}
