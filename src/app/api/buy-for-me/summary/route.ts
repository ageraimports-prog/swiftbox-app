import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { myBuyForMeCounts } from "@/lib/buy-for-me";

/** GET — for the dashboard card: open requests and how many have an update. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await myBuyForMeCounts(session.id));
  } catch {
    return NextResponse.json({ open: 0, updates: 0 });
  }
}
