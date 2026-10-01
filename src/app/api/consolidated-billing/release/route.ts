import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getCbState, releaseCbGroup } from "@/lib/consolidated-billing";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * POST { groupId } — "Send my packages now". The admin closes the customer's
 * OWN open group exactly as on day 21 (it refuses any group that is not this
 * session's user's) and owns every rule; this route only forwards the session's
 * user id. A group that has already stopped taking packages answers
 * `already: true` with the fresh state — a double tap is harmless.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let groupId = 0;
  try {
    groupId = Number((await req.json())?.groupId);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!Number.isInteger(groupId) || groupId <= 0) return NextResponse.json({ error: "groupId is required" }, { status: 400 });
  try {
    const { already } = await releaseCbGroup(session.id, groupId);
    return NextResponse.json({ already, state: await getCbState(session.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't send your packages." }, { status: 400 });
  }
}
