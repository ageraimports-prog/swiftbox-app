import { invoiceHouseColumn } from "@/lib/house-accounts";
import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/session";
import { billingModeOf } from "@/lib/invoice-line";
import { cbHiddenInvoiceIds, cbBillForInvoice } from "@/lib/consolidated-billing";
import { invoiceMoney } from "@/lib/invoice-money-core";

type HeaderRow = {
  house_account: number;
  invoice_id: number;
  invoice_no: string;
  scope: "package" | "shipment";
  ship_no: string | null;
  status: "unpaid" | "partial" | "paid" | "house";
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

type PackageRow = {
  pk_id: number;
  wr: string;
  tracking: string | null;
  commodities: string | null;
  shipper: string | null;
  weight: string;
  pcs: number;
};


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
    `SELECT ${await invoiceHouseColumn()}, invoice_id, invoice_no, scope, ship_no, status, billing_mode, roe,
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
  // Consolidated Billing: an invoice whose packages are still held for their
  // group is not the customer's to see yet (R13) — it 404s like a draft. So does
  // an invoice on a bill that has not been issued yet: nothing per package shows
  // before the combined bill. A child of an ISSUED bill stays viewable and says
  // which bill it is on.
  const bill = await cbBillForInvoice(Number(h.invoice_id)).catch(() => null);
  const billNo = bill?.billNo ?? null;
  if (bill && !bill.issued) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!bill && (await cbHiddenInvoiceIds(session.id).catch(() => new Set<number>())).has(Number(h.invoice_id))) {
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

  // What the charges are FOR. Scoped by invoice_id from the header row above —
  // that row already passed `user_id = :userId`, which is what makes this safe.
  // Re-deriving ownership here would be a second, weaker copy of the same check.
  const pkgRows = await query<PackageRow>(
    `SELECT p.pk_id, p.wr, p.tracking, p.commodities, p.shipper, p.weight, p.pcs
       FROM swiftbox_invoice_packages ip
       JOIN mod_packages p ON p.pk_id = ip.pk_id
      WHERE ip.invoice_id = :id
      ORDER BY p.wr`,
    { id: h.invoice_id }
  );

  const total = Number(h.total_ttd);
  const paid = Number(h.amount_paid);
  // The money split — charges, referral credit, the owner's discount, balance,
  // status — is invoiceMoney (src/lib/invoice-money-core.ts), CODE-IDENTICAL to
  // the admin's lib/invoice-money-core.ts, which its getInvoiceDetail uses, so
  // the customer and the office can never read the same invoice differently.
  // Referral credit = the negative lines EXCEPT 'adjustment' lines (already in
  // the net shipping_ttd) and the discount (its own "Discount" row).
  const money = invoiceMoney(
    lineRows.map((l) => ({ ...l, lineType: l.line_type, amountTtd: Number(l.amount_ttd) })),
    total,
    paid,
    Number(h.house_account) === 1
  );

  return NextResponse.json({
    invoice: {
      invoiceNo: h.invoice_no,
      scope: h.scope,
      shipNo: h.ship_no,
      houseAccount: Number(h.house_account) === 1,
      status: money.status,
      billingMode: billingModeOf(h.billing_mode),
      consolidatedBillNo: billNo,
      roe: Number(h.roe),
      shippingTtd: Number(h.shipping_ttd),
      customsTotalTtd: Number(h.customs_total_ttd),
      referralCreditTtd: money.referralCreditTtd,
      // The owner's discount ("Discount (reason)"), already inside totalTtd.
      discount: money.discount,
      // What was charged before the discount — the footer's "Total due".
      chargesTotalTtd: money.chargesTotalTtd,
      totalTtd: total,
      amountPaid: paid,
      balance: money.balance,
      createdAt: h.created_at,
      lines: money.chargeLines.map((l) => ({
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
      // Trimmed like `reference` above: an empty string must render as nothing,
      // not as a labelled row with no value. Empty list is normal — a
      // shipment-scope invoice can have no membership rows at all.
      packages: pkgRows.map((p) => ({
        pkId: Number(p.pk_id),
        wr: (p.wr ?? "").trim(),
        tracking: (p.tracking ?? "").trim(),
        commodities: (p.commodities ?? "").trim(),
        shipper: (p.shipper ?? "").trim(),
        weight: Number(p.weight),
        pcs: Number(p.pcs),
      })),
    },
  });
}
