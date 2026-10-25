import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { recordKeepTogether } from "@/lib/consolidated-billing";

export const dynamic = "force-dynamic";

/**
 * POST { groupId } — the customer tapped "Keep waiting" on the Send-now question.
 * Forwards the session's user id to the admin (customer-keep), which records it for
 * the owner's activity board. A record only: nothing about the group changes, and
 * the answer is always { ok: true } once signed in — the customer never sees an error.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { groupId?: unknown };
  const groupId = Number(body?.groupId);
  if (Number.isInteger(groupId) && groupId > 0) await recordKeepTogether(session.id, groupId);
  return NextResponse.json({ ok: true });
}
