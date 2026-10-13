import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getContactDetails, saveContactDetails } from "@/lib/contact-details";

export const dynamic = "force-dynamic";

/** GET — the signed-in customer's addresses and phone numbers. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const details = await getContactDetails(session.id);
    if (!details) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    return NextResponse.json(details, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Couldn't load your details." }, { status: 500 });
  }
}

/**
 * PUT { phone, altPhone, address, city, addressLabel, altAddress, altCity,
 * altAddressLabel } — saves them (src/lib/contact-details-core.ts). The
 * alternate address and phone are optional; blank clears them.
 */
export async function PUT(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const r = await saveContactDetails(session.id, body);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r.details);
  } catch {
    return NextResponse.json({ error: "Couldn't save your details. Please try again." }, { status: 500 });
  }
}
