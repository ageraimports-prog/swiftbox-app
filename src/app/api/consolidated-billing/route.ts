import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getCbState, setCbSetting } from "@/lib/consolidated-billing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** GET — the customer's Consolidated Billing setting, their group and any bill ready. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getCbState(session.id));
  } catch {
    return NextResponse.json({ error: "Couldn't load Consolidated Billing." }, { status: 500 });
  }
}

/**
 * POST { on: boolean } — turn Consolidated Billing on or off. The admin makes
 * the change (turning it off sends out what's ready); if it can't, nothing moves.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { on?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (typeof body.on !== "boolean") return NextResponse.json({ error: "on must be true or false" }, { status: 400 });
  try {
    await setCbSetting(session.id, body.on);
    return NextResponse.json(await getCbState(session.id));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't change Consolidated Billing." }, { status: 400 });
  }
}
