"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  STATUS_BADGE,
  formatDate,
  formatTtd,
  invoiceBillingBadge,
  invoiceLineBasis,
  type InvoiceStatus,
} from "@/lib/invoice-line";

type Line = {
  lineType: string;
  description: string;
  currency: string;
  amount: number;
  amountTtd: number;
  qty: number | null;
  unit: string | null;
  rate: number | null;
  basis: string | null;
};

type Payment = {
  paymentId: number;
  amount: number;
  method: string;
  paidDate: string;
  reference: string;
};

type Pkg = {
  pkId: number;
  wr: string;
  tracking: string;
  commodities: string;
  shipper: string;
  weight: number;
  pcs: number;
};

type Invoice = {
  invoiceNo: string;
  scope: "package" | "shipment";
  shipNo: string | null;
  status: InvoiceStatus;
  billingMode: "air" | "ocean";
  roe: number;
  shippingTtd: number;
  customsTotalTtd: number;
  referralCreditTtd: number;
  totalTtd: number;
  amountPaid: number;
  balance: number;
  createdAt: string;
  lines: Line[];
  payments: Payment[];
  packages: Pkg[];
};

/** Line amounts carry their own currency label — "USD 19.90" / "TTD 135.53". */
function lineMoney(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-mist/10 py-3 last:border-b-0">
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-dark">
        {label}
      </dt>
      <dd className="text-right text-sm font-medium text-white">{value}</dd>
    </div>
  );
}

function TotalRow({
  label,
  value,
  emphasis,
  divider,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  divider?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-1.5 ${
        divider ? "mt-1.5 border-t border-mist/20 pt-2.5" : ""
      }`}
    >
      <span
        className={
          emphasis
            ? "text-sm font-semibold text-mist"
            : "text-xs text-muted-dark"
        }
      >
        {label}
      </span>
      <span
        className={
          emphasis
            ? "text-sm font-bold text-white"
            : "text-sm font-medium text-mist"
        }
      >
        {value}
      </span>
    </div>
  );
}

function SkeletonDetail() {
  return (
    <div className="flex animate-pulse flex-col gap-4">
      <div className="h-7 w-32 rounded bg-mist/10" />
      <div className="h-28 rounded-lg border border-mist/10 bg-ink-2" />
      <div className="h-40 rounded-lg border border-mist/10 bg-ink-2" />
      <div className="h-64 rounded-lg border border-mist/10 bg-ink-2" />
    </div>
  );
}

export default function InvoiceDetailPage() {
  const { invoiceNo } = useParams<{ invoiceNo: string }>();
  const [invoice, setInvoice] = React.useState<Invoice | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/invoices/${invoiceNo}`)
      .then(async (res) => {
        if (res.status === 404) throw new Error("notfound");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((d) => {
        if (!cancelled) setInvoice(d.invoice);
      })
      .catch((e: Error) => {
        if (!cancelled)
          setError(
            e.message === "notfound"
              ? "We couldn't find that invoice."
              : "Couldn't load this invoice. Please try again."
          );
      });
    return () => {
      cancelled = true;
    };
  }, [invoiceNo]);

  const badge = invoice
    ? STATUS_BADGE[invoice.status] ?? STATUS_BADGE.unpaid
    : null;
  const billingBadge = invoice
    ? invoiceBillingBadge(invoice.shipNo, invoice.billingMode)
    : null;
  const settled = !!invoice && invoice.balance <= 0;
  // Empty is normal (shipment-scope invoices carry no membership rows), and the
  // ?? guards a cached PWA shell meeting a response that predates this field.
  const pkgs = invoice?.packages ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard/invoices"
        className="flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-dark transition-colors hover:text-mist"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-4 w-4"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Invoices
      </Link>

      {error && (
        <div role="alert" className="rounded-md bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!invoice && !error && <SkeletonDetail />}

      {invoice && badge && (
        <>
          <div className="flex items-start justify-between gap-3">
            <h1 className="sb-disp text-2xl text-mist">{invoice.invoiceNo}</h1>
            <span
              className={`mt-1 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>

          {/* Balance — the thing they opened this screen for. */}
          <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-dark">
              Balance due
            </p>
            <p
              className={`sb-disp mt-1.5 text-3xl ${
                settled ? "text-green" : "text-amber-300"
              }`}
            >
              {formatTtd(invoice.balance)}
            </p>
            <p className="mt-2 text-xs text-muted-dark">
              Total {formatTtd(invoice.totalTtd)} · Paid{" "}
              {formatTtd(invoice.amountPaid)}
            </p>
          </section>

          {/* Invoice details */}
          <section className="rounded-lg border border-mist/10 bg-ink-2 px-4 py-1">
            <dl>
              <DetailRow label="Date" value={formatDate(invoice.createdAt)} />
              <DetailRow
                label="Shipment"
                value={
                  <span className="flex flex-wrap items-center justify-end gap-2">
                    <span>{invoice.shipNo ?? "—"}</span>
                    {billingBadge && (
                      <span className="rounded-sm bg-mist/10 px-1.5 py-0.5 text-[10px] font-semibold text-mist">
                        {billingBadge}
                      </span>
                    )}
                  </span>
                }
              />
              <DetailRow label="Exchange rate" value={invoice.roe.toFixed(4)} />
            </dl>
          </section>

          {/* What the charges are FOR. No membership rows → no card at all;
              a heading over nothing reads as a bug rather than as an absence. */}
          {pkgs.length > 0 && (
            <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-dark">
                {pkgs.length === 1 ? "Package" : "Packages"}
              </h2>

              {pkgs.map((p) => (
                <div key={p.pkId} className="mt-3 first:mt-1">
                  {/* Closes the loop: bill → package → tracking timeline. That
                      route runs its own ownership check, so linking is safe. */}
                  <Link
                    href={`/dashboard/packages/${p.pkId}`}
                    className="flex w-fit items-center gap-1 transition-colors active:text-mist"
                  >
                    <span className="sb-disp text-lg text-green">{p.wr}</span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      className="h-4 w-4 text-green"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m8.25 4.5 7.5 7.5-7.5 7.5"
                      />
                    </svg>
                  </Link>

                  <dl>
                    {p.tracking && (
                      <DetailRow
                        label="Tracking"
                        value={<span className="break-all">{p.tracking}</span>}
                      />
                    )}
                    {p.commodities && (
                      <DetailRow label="Contents" value={p.commodities} />
                    )}
                  </dl>
                </div>
              ))}
            </section>
          )}

          {/* Charges — rows, not a table: a table is too wide for a phone. */}
          <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-dark">
              Charges
            </h2>

            <ul className="flex flex-col">
              {invoice.lines.map((l, i) => {
                const basis = invoiceLineBasis(l);
                const credit = l.amountTtd < 0;
                return (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-4 border-b border-mist/10 py-3 first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          credit ? "text-green" : "text-white"
                        }`}
                      >
                        {l.description}
                      </p>
                      {basis.main && (
                        <p className="mt-0.5 text-xs text-muted-dark">
                          {basis.main}
                        </p>
                      )}
                      {basis.note && (
                        <p className="mt-0.5 text-[10px] text-muted-dark/70">
                          {basis.note}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={`text-sm font-bold ${
                          credit ? "text-green" : "text-white"
                        }`}
                      >
                        {lineMoney("TTD", l.amountTtd)}
                      </p>
                      {l.currency === "USD" && (
                        <p className="mt-0.5 text-xs text-muted-dark">
                          {lineMoney("USD", l.amount)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Shipping + Customs − Credit = Total */}
            <div className="mt-4 border-t border-mist/10 pt-3">
              <TotalRow label="Shipping" value={formatTtd(invoice.shippingTtd)} />
              <TotalRow label="Customs" value={formatTtd(invoice.customsTotalTtd)} />
              {invoice.referralCreditTtd < 0 && (
                <TotalRow
                  label="Referral credit"
                  value={formatTtd(invoice.referralCreditTtd)}
                />
              )}
              <TotalRow
                label="Total due"
                value={formatTtd(invoice.totalTtd)}
                emphasis
                divider
              />
              <TotalRow label="Amount paid" value={formatTtd(invoice.amountPaid)} />
              <TotalRow
                label="Balance due"
                value={formatTtd(invoice.balance)}
                emphasis
              />
            </div>
          </section>

          {/* Payments */}
          <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-dark">
              Payments
            </h2>

            {invoice.payments.length === 0 ? (
              <p className="text-xs text-muted-dark">No payments recorded yet.</p>
            ) : (
              <ul className="flex flex-col">
                {invoice.payments.map((p) => (
                  <li
                    key={p.paymentId}
                    className="flex items-start justify-between gap-4 border-b border-mist/10 py-3 first:pt-0 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">
                        {formatDate(p.paidDate)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-dark">
                        {p.method}
                        {p.reference && ` · ${p.reference}`}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-white">
                      {formatTtd(p.amount)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
