import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/session";
import { airdropPackageColumns } from "@/lib/airdrop-display";
import { cbPackageDisplay } from "@/lib/consolidated-billing";
import { customerStatusOverrides, viewFor } from "@/lib/customer-status";

type Row = {
  pk_id: number;
  wr: string;
  external_code: string | null;
  external_mode: string | null;
  tracking: string;
  pk_type: number;
  weight: number;
  pcs: number;
  shipper: string;
  commodities: string;
  date: string;
  ship_no: string | null;
  ship_status: number | null;
};

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ship_status stays raw (null = no shipment row); the client maps it to a
  // stepper stage via shipStatusToStage().
  const rows = await query<Row>(
    `SELECT p.pk_id, p.wr, p.tracking, p.pk_type, p.weight, p.pcs,
            p.shipper, p.commodities, p.date, ${airdropPackageColumns()},
            s.ship_no, s.ship_status
       FROM mod_packages p
       LEFT JOIN mod_shipment s ON s.package_id = p.pk_id
      WHERE p.user_id = :userId
      ORDER BY p.date DESC, p.pk_id DESC`,
    { userId: session.id }
  );

  // Consolidated Billing: which of these are waiting for their group (shown as
  // such, never as a stage — R13), and which released group members show the
  // last arrival's stage (R7).
  const cb = await cbPackageDisplay(session.id).catch(() => new Map());

  // A status the office set for the customer to see (display only). Only a
  // current, allowed one is sent; the merge rule reads the RAW ship_status.
  const overrides = await customerStatusOverrides(session.id, rows.map((r) => Number(r.pk_id)));

  const packages = rows.map((r) => ({
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
    shipNo: r.ship_no,
    // A waiting package reports only that it has left Miami — its real stage
    // (and with it, whether it has landed) is not sent to the browser at all.
    shipStatus: cb.get(Number(r.pk_id))?.waiting
      ? 1
      : cb.get(Number(r.pk_id))?.override
        ? cb.get(Number(r.pk_id))!.override!.shipStatus
        : r.ship_status == null ? null : Number(r.ship_status),
    cbWaiting: cb.get(Number(r.pk_id))?.waiting ?? false,
    // The customer said "send them"; still waiting for the group to go out.
    cbPreparing: cb.get(Number(r.pk_id))?.preparing ?? false,
    customerStatus: viewFor(
      overrides.get(Number(r.pk_id)),
      r.ship_status == null ? null : Number(r.ship_status),
      cb.get(Number(r.pk_id))?.grouped ?? false
    ),
  }));

  return NextResponse.json({ packages });
}
