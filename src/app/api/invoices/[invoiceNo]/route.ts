import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/session";
import { billingModeOf } from "@/lib/invoice-line";

type HeaderRow = {
  invoice_id: number;
  invoice_no: string;
  scope: "package" | "shipment";
  ship_no: string | null;
  status: "unpaid" | "partial" | "paid";
  billing_mode: string | null;
  roe: string;
  shipping_ttd: string;
  customs_total_ttd: string;
  total_ttd: string;
  amount_paid: string;
  created_at: string;
};

type LineRow = {
  line_type: string;
  description: string;
  currency: string;
  amount: string;
  amount_ttd: string;
  qty: string | null;
  unit: string | null;
  rate: string | null;
  basis: string | null;
};

type PaymentRow = {
  payment_id: number;
  amount: string;
  method: string;
  paid_date: string;
  reference: string | null;
};

const round2 = (n: number) => Number(`${Math.round(Number(`${n}e2`))}e-2`);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ invoiceNo: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { invoiceNo } = await params;
  // Invoice numbers are minted as INV-<n>. Anything else cannot be an invoice,
  // so it 404s before it ever reaches the database.
  if (!/^INV-\d+$/.test(invoiceNo)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // user_id filter doubles as the ownership check — someone else's invoice
  // 404s rather than leaking that it exists.
  //
  // ISSUED ONLY, exactly as the list route at ../route.ts. A 'draft' is waiting
  // on a human review and a 'held' draft is an open running tab still collecting
  // packages; neither is a real debt, both can change before a cent is owed, and
  // neither may be shown to the customer. A draft's invoice number 404s here.
  const headers = await query<HeaderRow>(
    `SELECT invoice_id, invoice_no, scope, ship_no, status, billing_mode, roe,
            shipping_ttd, customs_total_ttd, total_ttd, amount_paid, created_at
       FROM swiftbox_invoices
      WHERE invoice_no = :invoiceNo AND user_id = :userId AND lifecycle = 'issued'
      LIMIT 1`,
    { invoiceNo, userId: session.id }
  );

  const h = headers[0];
  if (!h) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const lineRows = await query<LineRow>(
    `SELECT line_type, description, currency, amount, amount_ttd, qty, unit, rate, basis
       FROM swiftbox_invoice_lines WHERE invoice_id = :id ORDER BY sort_order`,
    { id: h.invoice_id }
  );

  // created_by / recorded_by are deliberately NOT selected — those are internal
  // staff names, not customer data.
  const payRows = await query<PaymentRow>(
    `SELECT payment_id, amount, method, paid_date, reference
       FROM swiftbox_invoice_payments WHERE invoice_id = :id ORDER BY paid_date, payment_id`,
    { id: h.invoice_id }
  );

  const total = Number(h.total_ttd);
  const paid = Number(h.amount_paid);
  // Referral credit = the negative TTD lines (the only negative lines we ever
  // write — every charge line is positive). Already reflected in total_ttd;
  // surfaced so the footer reconciles Shipping + Customs − Credit = Total.
  const referralCreditTtd = round2(
    lineRows.reduce((a, l) => a + Math.min(0, Number(l.amount_ttd)), 0)
  );

  return NextResponse.json({
    invoice: {
      invoiceNo: h.invoice_no,
      scope: h.scope,
      shipNo: h.ship_no,
      status: h.status,
      billingMode: billingModeOf(h.billing_mode),
      roe: Number(h.roe),
      shippingTtd: Number(h.shipping_ttd),
      customsTotalTtd: Number(h.customs_total_ttd),
      referralCreditTtd,
      totalTtd: total,
      amountPaid: paid,
      balance: round2(total - paid),
      createdAt: h.created_at,
      lines: lineRows.map((l) => ({
        lineType: l.line_type,
        description: l.description,
        currency: l.currency,
        amount: Number(l.amount),
        amountTtd: Number(l.amount_ttd),
        // NULL stays NULL — Number(null) is 0, and a qty of 0 would read as a
        // real measurement rather than as "this line was never derived".
        qty: l.qty == null ? null : Number(l.qty),
        unit: l.unit,
        rate: l.rate == null ? null : Number(l.rate),
        basis: l.basis,
      })),
      payments: payRows.map((p) => ({
        paymentId: Number(p.payment_id),
        amount: Number(p.amount),
        method: p.method,
        paidDate: p.paid_date,
        reference: (p.reference ?? "").trim(),
      })),
    },
  });
}
