import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getCbState, releaseCbGroup } from "@/lib/consolidated-billing";
import { parseSendNowRequest } from "@/lib/send-now-request";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

/**
 * POST { groupId, confirmed: true } — "Send my packages now", after the customer
 * confirmed that it closes their group (send-now-request.ts refuses anything else). The admin closes the customer's
 * OWN open group exactly as on day 21 (it refuses any group that is not this
 * session's user's) and owns every rule; this route only forwards the session's
 * user id. A group that has already stopped taking packages answers
 * `already: true` with the fresh state — a double tap is harmless.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  // Only a request from the confirmation ("Yes, send these now") goes through.
  const parsed = parseSendNowRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const groupId = parsed.groupId;
  try {
    const { already } = await releaseCbGroup(session.id, groupId);
    return NextResponse.json({ already, state: await getCbState(session.id) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't send your packages." }, { status: 400 });
  }
}
