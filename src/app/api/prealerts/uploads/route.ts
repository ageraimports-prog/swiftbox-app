import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { uploadsEnabled } from "@/lib/prealert-file-server";

/** GET — is the optional invoice upload switched on? The forms hide the field until it is. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ enabled: await uploadsEnabled() });
}
