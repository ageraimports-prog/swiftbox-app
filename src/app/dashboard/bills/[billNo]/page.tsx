"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { STATUS_BADGE, formatDate, formatTtd, type InvoiceStatus } from "@/lib/invoice-line";
import type { CbBillDetail, CbBillWeights } from "@/lib/consolidated-billing";
import { cbSavingLine, formatExactLb } from "@/lib/consolidatedBilling";
import { displayTitle, packagesSummary, shortRef, trackingNumbers } from "@/lib/packageDisplay";
import { RefText, TrackingLine } from "@/components/PackageCard";

/**
 * One Consolidated Bill: every package with its freight, fuel and insurance,
 * its customs charges item by item (declared value, duty, OPT, VAT), a package
 * subtotal, then the grand total, credits, paid and amount due — the same
 * layout as the PDF (R9). Rows, not tables: a table is too wide for a phone.
 *
 * Headed like every other card in the app: what the packages ARE leads
 * ("Shoes + 4 more"), the CB number is the small ref — and each package block
 * leads with its description and carrier tracking, its WR/SWF as the ref.
 */
export default function BillPage() {
  const { billNo } = useParams<{ billNo: string }>();
  const [bill, setBill] = React.useState<CbBillDetail | null>(null);
  const [weights, setWeights] = React.useState<CbBillWeights | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/consolidated-bills/${encodeURIComponent(billNo)}`)
      .then(async (res) => {
        if (res.status === 404) throw new Error("notfound");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((d) => { if (!cancelled) { setBill(d.bill); setWeights(d.weights ?? null); } })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error && e.message === "notfound" ? "We couldn't find that bill." : "Couldn't load this bill. Please try again.");
      });
    return () => { cancelled = true; };
  }, [billNo]);

  const t = bill?.totals;
  // Combined-weight freight: shown once the admin has priced the group on it.
  const w = weights && weights.ready && weights.billedLb > 0 ? weights : null;
  const saved = w ? cbSavingLine(w.savingLb, w.savingUsd, w.savingTtd) : null;
  const exactFor = (pkId: number | null | undefined) =>
    pkId == null ? null : weights?.packages.find((p) => p.pkId === pkId)?.exactLb ?? null;
  const badge = t ? STATUS_BADGE[t.status as InvoiceStatus] ?? STATUS_BADGE.unpaid : null;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/dashboard/invoices" className="flex w-fit items-center gap-1 text-sm text-muted-dark transition-colors hover:text-mist">
        ← Invoices
      </Link>

      {error && <div role="alert" className="rounded-md bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</div>}
      {!bill && !error && <div className="h-64 animate-pulse rounded-lg border border-mist/10 bg-ink-2" />}

      {bill && t && badge && (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex items-start justify-between gap-3">
              <h1 className="sb-disp min-w-0 break-words text-2xl text-mist">
                {packagesSummary(bill.packages.map((p) => displayTitle(p.contents) ?? "Package")) || "Your packages"}
              </h1>
              <span className={`mt-1 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
            </div>
            <p className="text-xs text-muted-dark">
              Consolidated Bill · {bill.packages.length} {bill.packages.length === 1 ? "package" : "packages"} · {formatDate(bill.date)}
            </p>
            <RefText refCode={bill.billNo} />
          </div>

          <a
            href={`/api/consolidated-bills/${encodeURIComponent(bill.billNo)}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center rounded-lg border border-green/40 bg-ink px-4 py-3 text-sm font-bold text-green transition-colors hover:border-green hover:bg-green/5"
          >
            Download PDF
          </a>

          {bill.packages.map((p) => {
            const s = p.section;
            const title = displayTitle(p.contents) ?? "Package";
            const numbers = trackingNumbers(p.tracking);
            return (
              <section key={p.invoiceNo} className="rounded-lg border border-mist/10 bg-ink-2 p-5">
                {p.pkId ? (
                  <Link href={`/dashboard/packages/${p.pkId}`} className="sb-disp block min-w-0 truncate text-lg text-green">{title}</Link>
                ) : (
                  <p className="sb-disp min-w-0 truncate text-lg text-green">{title}</p>
                )}
                {numbers[0] && <TrackingLine tracking={numbers[0]} more={numbers.length - 1} className="mt-1" />}
                <p className="mt-1 text-[11px] text-muted-dark/70">
                  Ref {shortRef(p.wr)} · {p.invoiceNo}
                  {exactFor(p.pkId) != null && <> · {formatExactLb(exactFor(p.pkId) as number)}</>}
                </p>

                <ul className="mt-3 flex flex-col text-sm">
                  <Row label="Freight" value={s.freightTtd} />
                  {s.fuelTtd > 0 && <Row label="Fuel surcharge" value={s.fuelTtd} />}
                  <Row label="Insurance" value={s.insuranceTtd} />
                  {s.otherChargesTtd > 0 && <Row label="Other charges" value={s.otherChargesTtd} />}
                </ul>

                <p className="mt-3 text-[10px] font-semibold uppercase tracking-widest text-muted-dark">Customs, by item</p>
                <ul className="mt-1 flex flex-col">
                  {s.items.map((it, i) => (
                    <li key={i} className="border-b border-mist/10 py-2 last:border-b-0">
                      <div className="flex justify-between gap-3 text-sm">
                        <span className="text-white">{it.description}</span>
                        <span className="font-bold text-white">{formatTtd(it.dutyTtd + it.optTtd + it.vatTtd + it.otherTaxTtd)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-dark">
                        Declared US${it.declaredValueUsd.toFixed(2)} · Duty {formatTtd(it.dutyTtd)} · OPT {formatTtd(it.optTtd)} · VAT {formatTtd(it.vatTtd)}
                        {it.otherTaxTtd > 0 ? ` · Other ${formatTtd(it.otherTaxTtd)}` : ""}
                      </p>
                    </li>
                  ))}
                </ul>

                <div className="mt-2 flex justify-between border-t border-mist/10 pt-2 text-sm font-bold text-mist">
                  <span>Package subtotal</span>
                  <span>{formatTtd(s.subtotalTtd)}</span>
                </div>
              </section>
            );
          })}

          {w && (
            <section className="rounded-lg border border-mist/10 bg-ink-2 p-5 text-sm">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-dark">Weight</p>
              <div className="mt-2">
                <Weight label="Combined exact weight" value={formatExactLb(w.exactTotalLb)} />
                <Weight label="Billed weight (rounded up once)" value={`${w.billedLb} lb`} strong />
                {saved && <Weight label="Billed separately (each package rounded up)" value={`${w.separateLb} lb`} />}
              </div>
              {saved && <p className="mt-3 rounded-md bg-green/10 px-3 py-2 text-sm font-bold text-green">{saved}</p>}
            </section>
          )}

          <section className="rounded-lg border border-mist/10 bg-ink-2 p-5 text-sm">
            <Total label={`Total for ${bill.packages.length} ${bill.packages.length === 1 ? "package" : "packages"}`} value={t.chargesTtd} />
            {t.creditsTtd < 0 && <Total label="Credits applied" value={t.creditsTtd} />}
            <Total label="Grand total" value={t.totalTtd} strong />
            <Total label="Amount paid" value={t.paidTtd} />
            <Total label="Amount due" value={t.dueTtd} strong accent />
            <p className="mt-3 text-xs text-muted-dark">
              You pay the whole bill at once when your packages are delivered, including in TT$ cash to the driver at your door.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex justify-between gap-3 border-b border-mist/10 py-2 last:border-b-0">
      <span className="text-white">{label}</span>
      <span className="font-bold text-white">{formatTtd(value)}</span>
    </li>
  );
}

function Total({ label, value, strong, accent }: { label: string; value: number; strong?: boolean; accent?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${strong ? "font-bold" : ""} ${accent ? "text-green" : "text-mist"}`}>
      <span>{label}</span>
      <span>{formatTtd(value)}</span>
    </div>
  );
}

function Weight({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-1 ${strong ? "font-bold text-mist" : "text-mist"}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
