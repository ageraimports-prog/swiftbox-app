import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/session";
import { airdropPackageColumns } from "@/lib/airdrop-display";
import { cbPackageFacts } from "@/lib/consolidated-billing";
import { CLEARED_SQL, INVOICE_ISSUED_AT_SQL, PACKAGE_CANCELLED_SQL, customerDisplayFloors, customerStatusOverrides, viewFor } from "@/lib/customer-status";
import { openPrealertRows } from "@/lib/prealert-flags";

type Row = {
  pk_id: number;
  wr: string;
  external_code: string | null;
  external_mode: string | null;
  external_received_at: string | null;
  tracking: string;
  pk_type: number;
  weight: number;
  pcs: number;
  shipper: string;
  commodities: string;
  date: string;
  ship_no: string | null;
  ship_status: number | null;
  cleared: number | null;
  invoice_issued_at: string | null;
  cancelled?: number | string | null;
};

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ship_status is read raw (null = no shipment row); what the customer sees is
  // decided below by the shared rule and sent as `status`.
  const rows = await query<Row>(
    `SELECT p.pk_id, p.wr, p.tracking, p.pk_type, p.weight, p.pcs,
            p.shipper, p.commodities, p.date, ${await airdropPackageColumns()},
            s.ship_no, s.ship_status, ${CLEARED_SQL} AS cleared,
            ${INVOICE_ISSUED_AT_SQL} AS invoice_issued_at,
            ${PACKAGE_CANCELLED_SQL} AS cancelled
       FROM mod_packages p
       LEFT JOIN mod_shipment s ON s.package_id = p.pk_id
      WHERE p.user_id = :userId
      ORDER BY p.date DESC, p.pk_id DESC`,
    { userId: session.id }
  );

  // Consolidated Billing membership and the office's status (display only),
  // each read on its own and never fatal.
  const cb = await cbPackageFacts(session.id).catch(() => new Map());
  // R4 (Brent, 2026-10-23): the customer's pre-alerts with no package yet —
  // "Not yet received in Miami", or "Flagged — checking with warehouse" once the
  // office flagged the missing check-in. Read on its own, never fatal.
  const prealerts = await openPrealertRows(session.id);
  const overrides = await customerStatusOverrides(session.id, rows.map((r) => Number(r.pk_id)));
  const floors = await customerDisplayFloors(session.id, rows.map((r) => Number(r.pk_id)));
  const now = Date.now();

  const packages = rows.map((r) => {
    const raw = r.ship_status == null ? null : Number(r.ship_status);
    // THE shared rule (customer-facing-status-core.ts). A Consolidated Billing
    // member never sends its real stage or its shipment number to the browser:
    // "Consolidating" must not be undone by reading the response.
    const status = viewFor({
      override: overrides.get(Number(r.pk_id)),
      rawShipStatus: raw,
      cleared: Number(r.cleared) > 0,
      pkType: Number(r.pk_type),
      cb: cb.get(Number(r.pk_id))?.membership ?? null,
      airdrop: { receivedAt: r.external_received_at, mode: r.external_mode },
      invoiceIssuedAt: r.invoice_issued_at,
      cancelled: Number(r.cancelled ?? 0) === 1,
      displayFloor: floors.get(Number(r.pk_id)) ?? null,
      nowMs: now,
    });
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
