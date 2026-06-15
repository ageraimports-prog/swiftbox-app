import { NextResponse } from "next/server";
import { verifyTransport } from "@/lib/email";

/**
 * TEMPORARY diagnostic — SP06 Block D pre-flight.
 *
 * Confirms the production SMTP_* env vars authenticate against the cPanel
 * mailbox without sending any mail (verify() only). Unauthenticated and must be
 * DELETED before the block closes — never leave this shipped.
 */
export async function GET() {
  try {
    await verifyTransport();
    return NextResponse.json({ ok: true });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
