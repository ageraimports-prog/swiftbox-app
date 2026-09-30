import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listPackagesNeedingPrealert } from "@/lib/prealert-pick-server";

/** GET — the logged-in customer's packages already at our warehouse and waiting for a pre-alert, oldest first. */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const packages = await listPackagesNeedingPrealert(session.id);
  return NextResponse.json({ packages });
}
