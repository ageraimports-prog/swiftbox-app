import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/session";
import { airdropPackageColumns } from "@/lib/airdrop-display";
import { cbPackageFacts } from "@/lib/consolidated-billing";
import { CLEARED_SQL, INVOICE_ISSUED_AT_SQL, customerStatusOverrides, viewFor } from "@/lib/customer-status";

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
  cleared: number | null;
  invoice_issued_at: string | null;
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
            s.ofd_date, s.delivered_date, ${CLEARED_SQL} AS cleared,
            ${INVOICE_ISSUED_AT_SQL} AS invoice_issued_at
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

  // THE shared rule (customer-facing-status-core.ts): the office's status,
  // Consolidated Billing, the 5 pm drop, the real stage.
  const cb = (await cbPackageFacts(session.id).catch(() => new Map())).get(Number(r.pk_id));
  const raw = r.ship_status == null ? null : Number(r.ship_status);
  const status = viewFor({
    override: (await customerStatusOverrides(session.id, [Number(r.pk_id)])).get(Number(r.pk_id)),
    rawShipStatus: raw,
    cleared: Number(r.cleared) > 0,
    pkType: Number(r.pk_type),
    cb: cb?.membership ?? null,
    airdrop: { receivedAt: r.external_received_at, mode: r.external_mode },
    invoiceIssuedAt: r.invoice_issued_at,
  });
  // A Consolidated Billing member never sends its shipment number, its real
  // stage, or a transit / clearance date: where it is and when it moves is
  // internal (R13). Out for Delivery / Delivered dates show once it gets there.
  const m = status.cb;

  return NextResponse.json({
    status,
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
            shipNo: m ? null : r.ship_no,
            shipStatus: m ? null : raw,
            miamiDate: m ? r.date : r.miami_date,
            transitDate: m ? null : r.transit_date,
            awaitingDate: m ? null : r.awaiting_date,
            ofdDate: m && status.stage < 3 ? null : r.ofd_date,
            deliveredDate: m && status.stage < 4 ? null : r.delivered_date,
          },
  });
}
