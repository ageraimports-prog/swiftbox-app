"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { usdText, type BfmStatus, type QuoteFigures } from "@/lib/buy-for-me-core";
import { allInNotice, type BfmAllIn } from "@/lib/buy-for-me-quote";
import { BuyForMeRules, PAYMENT_ONLY_LINE, StatusPill, card, formatDate, ghostButton, greenButton, ttd, usd } from "../ui";
import { BfmPaused } from "../paused";

type Quote = {
  id: number;
  seq: number;
  ref: string;
  kind: "original" | "topup";
  status: "awaiting_payment" | "paid";
  reason: string | null;
  figures: QuoteFigures;
  allIn: BfmAllIn | null;
  amountDueTtdCents: number;
  paidTtdCents: number | null;
};
type Detail = {
  id: number;
  no: string;
  status: BfmStatus;
  statusLabel: string;
  statusReason: string | null;
  note: string | null;
  createdAt: string | null;
  items: Array<{ lineNo: number; productUrl: string | null; productText: string; qty: number; variant: string | null; priceSeenCents: number | null; note: string | null; retailerOrderNo: string | null; usTracking: string | null }>;
  quotes: Quote[];
  openQuote: Quote | null;
  bank: { bank: string; accountName: string; accountNumber: string; accountType: string; branch: string; instructions: string } | null;
  slips: Array<{ id: number; ref: string; status: "pending" | "confirmed" | "rejected"; uploadedAt: string | null; rejectReason: string | null }>;
  refunds: Array<{ amountTtdCents: number; method: string; date: string | null; note: string | null }>;
  packages: Array<{ pkId: number; wr: string | null }>;
  history: Array<{ title: string; message: string | null; at: string | null }>;
  canUploadSlip: boolean;
  canCancel: boolean;
  feePct: number;
  /** Buy For Me is switched off: shown read-only, no payment asked for. */
  paused: boolean;
};

/** Phone photos are often 3–8 MB: shrink big images before upload so they fit the 4 MB limit. */
async function shrinkIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.size <= 1_500_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file; // the server still checks the real type and size
  }
}

type QuoteRow = { label: string; ttdCents: number; usdCents?: number; caption?: string };

/**
 * One quote, exactly as the admin froze it — this app never recalculates. TTD
 * first, USD in brackets. An all-in quote adds the Trinidad part (courier, then
 * duty/OPT/VAT/other) and its total is grand_total_ttd; a purchase-only quote
 * (legacy, or before migration 043) stops at the service fee.
 */
function QuoteBlock({ q }: { q: Quote }) {
  const f = q.figures;
  const a = q.allIn;
  const rows: QuoteRow[] = [
    { label: "Item value", ttdCents: f.ttd.itemValue, usdCents: f.usd.itemValue },
    { label: "US sales tax", ttdCents: f.ttd.usTax, usdCents: f.usd.usTax },
    { label: "US shipping to Miami", ttdCents: f.ttd.usShipping, usdCents: f.usd.usShipping },
    { label: `Service fee (${f.feePct}% of item value)`, ttdCents: f.ttd.fee, usdCents: f.usd.fee },
  ];
  if (a) {
    rows.push({
      label: "Freight, fuel & insurance to Trinidad",
      ttdCents: a.courierTtdCents,
      usdCents: a.freightUsdCents + a.fuelUsdCents + a.insuranceUsdCents,
      caption: `Freight ${usdText(a.freightUsdCents)} · Fuel ${usdText(a.fuelUsdCents)} · Insurance ${usdText(a.insuranceUsdCents)}`,
    });
    rows.push({ label: "Duty", ttdCents: a.dutyTtdCents });
    if (a.optTtdCents > 0) rows.push({ label: "OPT", ttdCents: a.optTtdCents });
    rows.push({ label: "VAT", ttdCents: a.vatTtdCents });
    if (a.otherTtdCents > 0) rows.push({ label: "Other taxes", ttdCents: a.otherTtdCents });
  }
  return (
    <div>
      {q.kind === "topup" && q.reason && <p className="mb-2 text-sm text-mist">Why: {q.reason}</p>}
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="py-1 pr-2 align-top text-muted-dark">
                {r.label}
                {r.caption && <span className="mt-0.5 block text-[11px] text-muted-dark/80">{r.caption}</span>}
              </td>
              <td className="whitespace-nowrap py-1 text-right align-top text-mist">
                {ttd(r.ttdCents)}
                {r.usdCents != null && <span className="block text-xs text-muted-dark">({usd(r.usdCents)})</span>}
              </td>
            </tr>
          ))}
          <tr className="border-t border-mist/15">
            <td className="pt-2 pr-2 font-semibold text-mist">Total to pay</td>
            <td className="whitespace-nowrap pt-2 text-right align-top font-semibold text-green">
              {ttd(q.amountDueTtdCents)}
              {!a && <span className="block text-xs font-normal text-muted-dark">({usd(f.usd.total)})</span>}
            </td>
          </tr>
        </tbody>
      </table>
      {a && <p className="mt-3 text-xs text-muted-dark">{allInNotice(a.estWeightLb)}</p>}
    </div>
  );
}


export default function BuyForMeRequestPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [armCancel, setArmCancel] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(() => {
    fetch(`/api/buy-for-me/${id}`)
      .then(async (r) => {
        if (r.status === 404) throw new Error("This request wasn't found.");
        if (!r.ok) throw new Error("Couldn't load this request. Please try again.");
        return r.json();
      })
      .then((x) => setD(x.request))
      .catch((e) => setError(e.message));
  }, [id]);
  React.useEffect(load, [load]);

  async function upload(file: File) {
    setBusy("upload");
    setMsg(null);
    const small = await shrinkIfNeeded(file);
    const form = new FormData();
    form.append("file", small, small.name);
    const res = await fetch(`/api/buy-for-me/${id}/slip`, { method: "POST", body: form }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    if (!res || !res.ok) {
      setMsg({ ok: false, text: data.error ?? "The upload failed — please try again." });
      return;
    }
    setMsg({ ok: true, text: "Thanks — your payment slip was sent. We'll confirm it shortly." });
    load();
  }

  async function cancel() {
    setBusy("cancel");
    setMsg(null);
    const res = await fetch(`/api/buy-for-me/${id}/cancel`, { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    setBusy(null);
    setArmCancel(false);
    if (!res || !res.ok) {
      setMsg({ ok: false, text: data.error ?? "Couldn't cancel — please try again." });
      return;
    }
    load();
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/dashboard/buy-for-me" className="text-xs text-muted-dark hover:text-mist">← Buy For Me</Link>
        <div role="alert" className="rounded-md bg-red-400/10 px-4 py-3 text-sm text-red-300">{error}</div>
      </div>
    );
  }
  if (!d) return <div className={`${card} h-40 animate-pulse`} />;

  const paidQuotes = d.quotes.filter((q) => q.status === "paid");
  const lastRejected = [...d.slips].reverse().find((s) => s.status === "rejected");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Link href="/dashboard/buy-for-me" className="text-xs text-muted-dark hover:text-mist">← Buy For Me</Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="sb-disp font-mono text-xl text-mist">{d.no}</h1>
          <StatusPill status={d.status} label={d.statusLabel} />
        </div>
        <p className="mt-1 text-xs text-muted-dark">Requested {formatDate(d.createdAt)}</p>
        {d.statusReason && ["cancelled", "rejected", "unable_to_purchase"].includes(d.status) && (
          <p className="mt-2 text-sm text-mist">{d.statusReason}</p>
        )}
      </div>

      {msg && (
        <div role="status" className={`rounded-md px-4 py-3 text-sm ${msg.ok ? "bg-green/10 text-green" : "bg-red-400/10 text-red-300"}`}>{msg.text}</div>
      )}

      {d.paused && <BfmPaused compact />}

      {d.status === "submitted" && !d.paused && (
        <section className={card}>
          <p className="text-sm text-mist">Thanks — we&apos;ve got your request. A Swiftbox team member will check the items and send you one all-in quote — the item, our fee, freight to Trinidad, duty, OPT and VAT — with our bank details. You don&apos;t pay anything until then.</p>
        </section>
      )}

      {d.openQuote && (
        <section className={`${card} border-green/30`}>
          <p className="text-sm font-semibold text-mist">{d.openQuote.kind === "topup" ? "Top-up needed" : "Your quote"}</p>
          <div className="mt-3"><QuoteBlock q={d.openQuote} /></div>

          {d.paused ? (
            // Paused: the quote is shown for the record, but no payment is taken —
            // no reference, no bank details, no upload (the API refuses a slip too).
            <p className="mt-5 rounded-md bg-amber-400/10 px-3 py-2 text-sm text-amber-200">
              Payment for this quote is on hold while Buy For Me is paused — please don&apos;t send a payment.
            </p>
          ) : (
          <>
          <div className="mt-5 border-t border-mist/10 pt-4">
            <p className="text-sm font-semibold text-mist">How to pay</p>
            <p className="mt-1 text-sm text-mist">
              Pay <span className="font-semibold text-green">{ttd(d.openQuote.amountDueTtdCents)}</span> by bank deposit or bank
              transfer, using the reference below.
            </p>
            <p className="mt-2 rounded-md bg-amber-400/10 px-3 py-2 text-xs text-amber-200">{PAYMENT_ONLY_LINE}</p>
            <p className="mt-2 text-xs text-muted-dark">Nothing is bought until our team confirms your payment.</p>
          </div>

          <div className="mt-4 rounded-lg bg-ink p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-dark">Payment reference</p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="sb-disp font-mono text-2xl tracking-wider text-green">{d.openQuote.ref}</p>
              <button
                type="button"
                className={ghostButton}
                onClick={() => {
                  navigator.clipboard?.writeText(d.openQuote!.ref).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-1 text-xs text-muted-dark">Put this reference on your bank transfer or deposit slip.</p>
          </div>

          {d.bank ? (
            <div className="mt-4 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-dark">Our bank details</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted-dark">Bank</dt><dd className="text-mist">{d.bank.bank}</dd>
                <dt className="text-muted-dark">Account name</dt><dd className="text-mist">{d.bank.accountName}</dd>
                <dt className="text-muted-dark">Account number</dt><dd className="font-mono text-mist">{d.bank.accountNumber}</dd>
                {d.bank.accountType && (<><dt className="text-muted-dark">Account type</dt><dd className="text-mist">{d.bank.accountType}</dd></>)}
                {d.bank.branch && (<><dt className="text-muted-dark">Branch</dt><dd className="text-mist">{d.bank.branch}</dd></>)}
              </dl>
              {d.bank.instructions && <p className="mt-2 text-xs text-muted-dark">{d.bank.instructions}</p>}
            </div>
          ) : (
            <p className="mt-4 text-sm text-mist">Our bank details will be sent to you by the Swiftbox team.</p>
          )}

          {lastRejected && d.canUploadSlip && (
            <p className="mt-4 rounded-md bg-red-400/10 px-3 py-2 text-sm text-red-300">
              We couldn&apos;t accept your last payment slip{lastRejected.rejectReason ? `: ${lastRejected.rejectReason}` : "."} Please upload it again.
            </p>
          )}

          {d.canUploadSlip && (
            <div className="mt-5">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(f);
                  e.target.value = "";
                }}
              />
              <button type="button" className={`${greenButton} w-full`} disabled={busy !== null} onClick={() => fileRef.current?.click()}>
                {busy === "upload" ? "Uploading…" : "I've paid — upload my payment slip"}
              </button>
              <p className="mt-2 text-center text-xs text-muted-dark">A photo or screenshot of the slip, or a PDF.</p>
            </div>
          )}
          </>
          )}
        </section>
      )}

      {d.status === "payment_uploaded" && (
        <section className={card}>
          <p className="text-sm text-mist">We&apos;ve got your payment slip and are checking it. We buy your item as soon as the payment is confirmed.</p>
        </section>
      )}

      <section className={card}>
        <p className="text-sm font-semibold text-mist">Items</p>
        <ul className="mt-3 flex flex-col gap-3">
          {d.items.map((it) => (
            <li key={it.lineNo} className="text-sm">
              {it.productUrl ? (
                <a href={it.productUrl} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-green underline underline-offset-2">{it.productText}</a>
              ) : (
                <span className="break-all text-mist">{it.productText}</span>
              )}
              <p className="text-xs text-muted-dark">
                Qty {it.qty}
                {it.variant ? ` · ${it.variant}` : ""}
                {it.priceSeenCents != null ? ` · you saw ${usd(it.priceSeenCents)}` : ""}
              </p>
              {it.note && <p className="text-xs italic text-muted-dark">“{it.note}”</p>}
              {(it.retailerOrderNo || it.usTracking) && (
                <p className="mt-1 text-xs text-mist">
                  {it.retailerOrderNo ? `Order ${it.retailerOrderNo}` : ""}
                  {it.usTracking ? ` · Tracking ${it.usTracking}` : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>

      {d.packages.length > 0 && (
        <section className={card}>
          <p className="text-sm font-semibold text-mist">At our Miami warehouse</p>
          <ul className="mt-2 text-sm">
            {d.packages.map((p) => (
              <li key={p.pkId}>
                <Link href={`/dashboard/packages/${p.pkId}`} className="text-green underline underline-offset-2">{p.wr ?? "Your package"}</Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-dark">
            {d.quotes.some((q) => q.allIn)
              ? "Delivery to Trinidad, duty and VAT were included in your quote. If the actual weight or the customs assessment is higher, the difference may be charged on delivery."
              : "Freight, duty and delivery for this package are billed on its own invoice."}
          </p>
        </section>
      )}

      {paidQuotes.length > 0 && (
        <section className={card}>
          <p className="text-sm font-semibold text-mist">Paid</p>
          {paidQuotes.map((q) => (
            <div key={q.id} className="mt-3 border-t border-mist/10 pt-3 first:border-0 first:pt-0">
              <p className="mb-2 font-mono text-xs text-muted-dark">{q.ref} · {q.kind === "topup" ? "top-up" : "quote"}{q.paidTtdCents != null ? ` · we received ${ttd(q.paidTtdCents)}` : ""}</p>
              <QuoteBlock q={q} />
            </div>
          ))}
        </section>
      )}

      {d.refunds.length > 0 && (
        <section className={card}>
          <p className="text-sm font-semibold text-mist">Refunds</p>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {d.refunds.map((f, i) => (
              <li key={i}>
                <span className="font-semibold text-mist">{ttd(f.amountTtdCents)}</span>
                <span className="text-muted-dark"> — {f.method}{f.date ? ` — ${formatDate(f.date)}` : ""}</span>
                {f.note && <p className="text-xs text-muted-dark">{f.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={card}>
        <p className="text-sm font-semibold text-mist">History</p>
        <ol className="mt-3 flex flex-col gap-3">
          {d.history.map((h, i) => (
            <li key={i} className="text-sm">
              <p className="text-mist">{h.title}</p>
              {h.message && <p className="text-xs text-muted-dark">{h.message}</p>}
              <p className="text-[11px] text-muted-dark">{formatDate(h.at)}</p>
            </li>
          ))}
        </ol>
      </section>

      {d.slips.length > 0 && (
        <section className={card}>
          <p className="text-sm font-semibold text-mist">Your payment slips</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {d.slips.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-2">
                <a href={`/api/buy-for-me/slip/${s.id}`} target="_blank" rel="noopener noreferrer" className="text-green underline underline-offset-2">View</a>
                <span className="text-muted-dark">{s.ref} · {formatDate(s.uploadedAt)} · {s.status === "confirmed" ? "confirmed" : s.status === "rejected" ? "not accepted" : "being checked"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.canCancel && (
        <section className={card}>
          {!armCancel ? (
            <button type="button" className={`${ghostButton} w-full`} onClick={() => setArmCancel(true)}>Cancel this request</button>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-mist">Cancel {d.no}? This can&apos;t be undone.</p>
              <div className="flex gap-2">
                <button type="button" className={`${ghostButton} flex-1 border-red-400/40 text-red-300`} disabled={busy !== null} onClick={cancel}>
                  {busy === "cancel" ? "Cancelling…" : "Yes, cancel it"}
                </button>
                <button type="button" className={`${ghostButton} flex-1`} onClick={() => setArmCancel(false)}>Keep it</button>
              </div>
            </div>
          )}
        </section>
      )}

      {(d.status === "submitted" || d.status === "quoted") && !d.paused && (
        <section className={card}>
          <BuyForMeRules feePct={d.feePct} />
        </section>
      )}
    </div>
  );
}
