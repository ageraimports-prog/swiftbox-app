import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/session";
import { airdropPackageColumns } from "@/lib/airdrop-display";

type Row = {
  pk_id: number;
  wr: string;
  external_code: string | null;
  external_mode: string | null;
  actual_weight: number;
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

  const packages = rows.map((r) => ({
    id: Number(r.pk_id),
    wr: r.wr,
    packageCode: r.external_code || r.wr,
    transportMode: r.external_mode,
    billableWeight: Number(r.weight),
    tracking: r.tracking,
    freight: Number(r.pk_type),
    weight: Number(r.actual_weight),
    pcs: Number(r.pcs),
    shipper: r.shipper,
    commodities: r.commodities,
    date: r.date,
    shipNo: r.ship_no,
    shipStatus: r.ship_status == null ? null : Number(r.ship_status),
  }));

  return NextResponse.json({ packages });
}
