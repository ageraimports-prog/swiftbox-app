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
  external_received_at: string | null;
  tracking: string;
  pk_type: number;
  weight: number;
  volumetric_weight: number;
  pcs: number;
  shipper: string;
  commodities: string;
  date: string;
  ship_id: number | null;
  ship_no: string | null;
  ship_status: number | null;
  miami_date: string | null;
  transit_date: string | null;
  awaiting_date: string | null;
  ofd_date: string | null;
  delivered_date: string | null;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const pkId = Number(id);
  if (!Number.isInteger(pkId) || pkId <= 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // user_id filter doubles as the ownership check — someone else's package
  // id 404s rather than leaking that it exists.
  const rows = await query<Row>(
    `SELECT p.pk_id, p.wr, p.tracking, p.pk_type, p.weight,
            p.volumetric_weight, p.pcs, p.shipper, p.commodities, p.date, ${airdropPackageColumns()},
            s.ship_id, s.ship_no, s.ship_status,
            s.miami_date, s.transit_date, s.awaiting_date,
            s.ofd_date, s.delivered_date
       FROM mod_packages p
       LEFT JOIN mod_shipment s ON s.package_id = p.pk_id
      WHERE p.pk_id = :pkId AND p.user_id = :userId
      LIMIT 1`,
    { pkId, userId: session.id }
  );

  const r = rows[0];
  if (!r) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Consolidated Billing. WAITING: only "left Miami" is sent — no later stage,
  // no later date — because the customer must not learn when it lands (R13).
  // RELEASED: the group's last arrival's stage and date (R7).
  const cb = (await cbPackageDisplay(session.id).catch(() => new Map())).get(Number(r.pk_id));
  const waiting = cb?.waiting ?? false;
  const shownStatus = waiting ? 1 : cb?.override ? cb.override.shipStatus : Number(r.ship_status);
  const shownAwaiting = waiting ? null : cb?.override ? cb.override.awaitingDate : r.awaiting_date;

  // A status the office set for the customer to see (display only). Only a
  // current, allowed one is sent; the merge rule reads the RAW ship_status.
  const customerStatus = viewFor(
    (await customerStatusOverrides(session.id, [Number(r.pk_id)])).get(Number(r.pk_id)),
    r.ship_status == null ? null : Number(r.ship_status),
    cb?.grouped ?? false,
    { receivedAt: r.external_received_at, mode: r.external_mode }
  );

  return NextResponse.json({
    customerStatus,
    cbWaiting: waiting,
    cbPreparing: cb?.preparing ?? false,
    cbInOpenGroup: cb?.inOpenGroup ?? false,
    package: {
      id: Number(r.pk_id),
      wr: r.wr,
      packageCode: r.external_code || r.wr,
      transportMode: r.external_mode,
      billableWeight: Number(r.weight),
      tracking: r.tracking,
      freight: Number(r.pk_type),
      weight: Number(r.weight),
      volumetricWeight: Number(r.volumetric_weight),
      pcs: Number(r.pcs),
      shipper: r.shipper,
      commodities: r.commodities,
      date: r.date,
    },
    shipment:
      r.ship_id == null
        ? null
        : {
            shipNo: r.ship_no,
            shipStatus: shownStatus,
            miamiDate: r.miami_date,
            transitDate: waiting ? null : r.transit_date,
            awaitingDate: shownAwaiting,
            ofdDate: waiting ? null : r.ofd_date,
            deliveredDate: waiting ? null : r.delivered_date,
          },
  });
}
