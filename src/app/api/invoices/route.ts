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

type PackageRow = {
  invoice_no: string;
  wr: string | null;
  tracking: string | null;
  commodities: string | null;
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

  // What each invoice bills for, so a row can lead with the package the customer
  // recognises (description + carrier tracking). Same header filter as above —
  // the child rows are reached only THROUGH this customer's issued headers, so an
  // orphaned or foreign swiftbox_invoice_packages row can never surface here.
  // Shipment-scope invoices carry no membership rows and simply get none.
  const pkgRows = rows.length
    ? await query<PackageRow>(
        `SELECT i.invoice_no, p.wr, p.tracking, p.commodities
           FROM swiftbox_invoices i
           JOIN swiftbox_invoice_packages ip ON ip.invoice_id = i.invoice_id
           JOIN mod_packages p ON p.pk_id = ip.pk_id
          WHERE i.user_id = :userId
            AND i.lifecycle = 'issued'
          ORDER BY i.invoice_id, p.wr`,
        { userId: session.id }
      )
    : [];
  const byInvoice = new Map<string, { wr: string; tracking: string; commodities: string }[]>();
  for (const p of pkgRows) {
    const list = byInvoice.get(p.invoice_no) ?? [];
    list.push({
      wr: (p.wr ?? "").trim(),
      tracking: (p.tracking ?? "").trim(),
      commodities: (p.commodities ?? "").trim(),
    });
    byInvoice.set(p.invoice_no, list);
  }

  const invoices = rows.map((r) => ({
    invoiceNo: r.invoice_no,
    scope: r.scope,
    totalTtd: Number(r.total_ttd),
    amountPaid: Number(r.amount_paid),
    status: r.status,
    createdAt: r.created_at,
    packages: byInvoice.get(r.invoice_no) ?? [],
  }));

  return NextResponse.json({ invoices });
}
