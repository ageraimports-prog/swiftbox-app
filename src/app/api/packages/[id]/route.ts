import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/session";

type Row = {
  pk_id: number;
  wr: string;
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
            p.volumetric_weight, p.pcs, p.shipper, p.commodities, p.date,
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

  return NextResponse.json({
    package: {
      id: Number(r.pk_id),
      wr: r.wr,
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
            shipStatus: Number(r.ship_status),
            miamiDate: r.miami_date,
            transitDate: r.transit_date,
            awaitingDate: r.awaiting_date,
            ofdDate: r.ofd_date,
            deliveredDate: r.delivered_date,
          },
  });
}
