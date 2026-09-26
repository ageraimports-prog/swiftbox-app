import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getConsolidationState, setOptIn } from "@/lib/consolidation";

/** GET — the customer's Consolidated Billing opt-in and any open hold. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await getConsolidationState(session.id));
  } catch {
    return NextResponse.json({ error: "Couldn't load Consolidated Billing." }, { status: 500 });
  }
}

/** POST { optIn: boolean } — turn Consolidated Billing on or off. Off releases any hold. */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { optIn?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (typeof body.optIn !== "boolean") {
    return NextResponse.json({ error: "optIn must be true or false" }, { status: 400 });
  }
  try {
    const firstName = session.name.split(" ")[0] || session.name;
    return NextResponse.json(await setOptIn(session.id, body.optIn, firstName, session.email));
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't change Consolidated Billing." },
      { status: 400 }
    );
  }
}
