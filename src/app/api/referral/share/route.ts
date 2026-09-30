import { NextResponse, after, type NextRequest } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isShareChannel, reportShareTap } from "@/lib/referral-events";

/**
 * POST { channel } — the dashboard's referral card reports a share tap
 * (navigator.sendBeacon). The code is read from the SIGNED-IN customer's own
 * row, never taken from the request, so nobody can count taps against
 * someone else's code. Always 204: tracking never shows an error.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return new NextResponse(null, { status: 204 });
  let channel: unknown = null;
  try {
    channel = JSON.parse(await req.text())?.channel;
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  if (!isShareChannel(channel)) return new NextResponse(null, { status: 204 });
  const ch = channel;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const userAgent = req.headers.get("user-agent") ?? "";
  const customerId = session.id;
  after(async () => {
    try {
      const rows = await query<{ code: string }>(
        "SELECT code FROM referral_codes WHERE customer_id = :customerId LIMIT 1",
        { customerId }
      );
      if (rows[0]?.code) await reportShareTap({ code: rows[0].code, channel: ch, ip, userAgent });
    } catch {
      /* tracking only */
    }
  });
  return new NextResponse(null, { status: 204 });
}
