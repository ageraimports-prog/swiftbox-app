import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getConsolidationState, releaseOpenGroup } from "@/lib/consolidation";

/** POST — "Deliver what's here now": release the customer's open hold. */
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const firstName = session.name.split(" ")[0] || session.name;
    const released = await releaseOpenGroup(session.id, firstName, session.email);
    return NextResponse.json({ released, ...(await getConsolidationState(session.id)) });
  } catch {
    return NextResponse.json({ error: "Couldn't release your packages. Please try again." }, { status: 500 });
  }
}
