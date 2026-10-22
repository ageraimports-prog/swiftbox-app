import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { fetchCbBillAdmin, getCbBill } from "@/lib/consolidated-billing";

/** GET — one of the customer's issued Consolidated Bills, per package and per item. */
export async function GET(_req: Request, { params }: { params: Promise<{ billNo: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { billNo } = await params;
  const no = decodeURIComponent(billNo);
  // Exact weights, the combined-weight saving and each WR's government charges
  // come from the admin (it checks the bill is this user's and issued); a bill
  // still shows without them if the admin can't be reached.
  const admin = /^CB-\d{6,}$/.test(no) ? await fetchCbBillAdmin(session.id, no) : { weights: null, customs: null };
  // The user_id filter inside getCbBill is the ownership check: someone else's
  // bill 404s rather than leaking that it exists.
  const bill = await getCbBill(session.id, no, admin.customs);
  if (!bill) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ bill, weights: admin.weights });
}
