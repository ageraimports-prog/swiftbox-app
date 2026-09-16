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
  //
  // ISSUED ONLY. An invoice has a lifecycle: 'draft' (generated in the admin queue,
  // waiting on a human review), 'held' (an open running tab for a customer on terms,
  // still collecting packages) and 'issued' (the bill actually sent). Only the last
  // is a real debt. Without this filter the customer sees a draft nobody has checked
  // yet — full total, "Unpaid" badge — and a held draft that is deliberately still
  // incomplete, both of which can change before a cent is owed. The admin side draws
  // this line everywhere already (email refuses a non-issued invoice; the customer
  // delete-block counts issued-unpaid only); this reader never got it.
  const rows = await query<Row>(
    `SELECT invoice_no, scope, total_ttd, amount_paid, status, created_at
       FROM swiftbox_invoices
      WHERE user_id = :userId
        AND lifecycle = 'issued'
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
