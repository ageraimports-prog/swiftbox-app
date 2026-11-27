import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { customerPackageViews } from "@/lib/package-views";
import { openPrealertRows } from "@/lib/prealert-flags";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // THE shared rule (customer-facing-status-core.ts), read once for every package
  // (lib/package-views.ts — the pre-alert cards read the same). A Consolidated
  // Billing member never sends its real stage or its shipment number to the
  // browser: "Consolidating" must not be undone by reading the response.
  const { packages: views, cbOn, hasCbMembers } = await customerPackageViews(session.id);
  // R4 (Brent, 2026-10-23): the customer's pre-alerts with no package yet —
  // "Not yet received in Miami", or "Flagged — checking with warehouse" once the
  // office flagged the missing check-in. Read on its own, never fatal.
  const prealerts = await openPrealertRows(session.id, cbOn || hasCbMembers);

  const packages = views.map(({ row: r, status }) => {
    const raw = r.ship_status == null ? null : Number(r.ship_status);
    return {
      id: Number(r.pk_id),
      wr: r.wr,
      packageCode: r.external_code || r.wr,
      transportMode: r.external_mode,
      billableWeight: Number(r.weight),
      tracking: r.tracking,
      freight: Number(r.pk_type),
      weight: Number(r.weight),
      pcs: Number(r.pcs),
      shipper: r.shipper,
      commodities: r.commodities,
      date: r.date,
      shipNo: status.cb ? null : r.ship_no,
      shipStatus: status.cb ? null : raw,
      status,
    };
  });

  return NextResponse.json({ packages, prealerts });
}
