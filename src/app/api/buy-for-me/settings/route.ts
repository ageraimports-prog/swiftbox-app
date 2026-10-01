import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getBfmFeePct } from "@/lib/buy-for-me";

/** GET — the current Buy For Me service fee % (bfm_fee_pct, fallback 15), for the rules copy. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ feePct: await getBfmFeePct() });
}
