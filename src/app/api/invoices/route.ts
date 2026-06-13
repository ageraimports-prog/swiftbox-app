import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/session";

type Row = {
  invoice_no: string;
  scope: "package" | "shipment";
  total_ttd: string;
  amount_paid: string;
  status: "unpaid" | "partial" | "paid";
  created_at: string;
};

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // status on swiftbox_invoices is authoritative — no payments join needed.
  const rows = await query<Row>(
    `SELECT invoice_no, scope, total_ttd, amount_paid, status, created_at
       FROM swiftbox_invoices
      WHERE user_id = :userId
      ORDER BY created_at DESC`,
    { userId: session.id }
  );

  const invoices = rows.map((r) => ({
    invoiceNo: r.invoice_no,
    scope: r.scope,
    totalTtd: Number(r.total_ttd),
    amountPaid: Number(r.amount_paid),
    status: r.status,
    createdAt: r.created_at,
  }));

  return NextResponse.json({ invoices });
}
