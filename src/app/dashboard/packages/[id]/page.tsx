"use client";

import * as React from "react";
import Link from "next/link";
import { CB_WAITING_LABEL, CB_NAME, CB_PREPARING_TEXT, HOLD_DAYS } from "@/lib/consolidatedBilling";
import SendMyPackagesNow from "@/components/SendMyPackagesNow";
import AirdropDocuments from "../AirdropDocuments";
import CopyTracking from "@/components/CopyTracking";
import { formatDescription, shortRef, trackingNumbers } from "@/lib/packageDisplay";
import { useParams } from "next/navigation";
import {
  STAGES,
  freightLabel,
  shipStatusToStage,
} from "@/lib/status";

type Pkg = {
  id: number;
  wr: string;
  packageCode?: string;
  transportMode?: string | null;
  billableWeight?: number;
  tracking: string;
  freight: number;
  weight: number;
  volumetricWeight: number;
  pcs: number;
  shipper: string;
  commodities: string;
  date: string;
};

type Shipment = {
  shipNo: string | null;
  shipStatus: number;
  miamiDate: string | null;
  transitDate: string | null;
  awaitingDate: string | null;
  ofdDate: string | null;
  deliveredDate: string | null;
};

function formatDate(date: string | null): string | null {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

function Stepper({ shipment, cbWaiting = false, cbPreparing = false }: { shipment: Shipment | null; cbWaiting?: boolean; cbPreparing?: boolean }) {
  // No shipment row = logged at Miami, not yet manifested → stage 0 active.
  const current = shipStatusToStage(shipment?.shipStatus ?? null);

  // Consolidated Billing: after Miami the package is simply waiting for its
  // group — one step, no later stages, no dates that would say it had landed.
  if (cbWaiting) {
    return (
      <ol className="flex flex-col">
        <li className="relative flex gap-4 pb-7">
          <span aria-hidden className="absolute left-[9px] top-5 h-full w-0.5 bg-green" />
          <span className="relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-mist">{STAGES[0].label}</p>
            {formatDate(shipment?.miamiDate ?? null) && <p className="mt-0.5 text-xs text-muted-dark">{formatDate(shipment?.miamiDate ?? null)}</p>}
          </div>
        </li>
        <li className="relative flex gap-4">
          <span className="relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
            <span className="relative h-3.5 w-3.5 rounded-full bg-violet-300" />
          </span>
          <p className="text-sm font-semibold text-violet-300">{cbPreparing ? CB_PREPARING_TEXT : CB_WAITING_LABEL}</p>
        </li>
      </ol>
    );
  }

  const dates: Record<string, string | null> = {
    miamiDate: shipment?.miamiDate ?? null,
    transitDate: shipment?.transitDate ?? null,
    awaitingDate: shipment?.awaitingDate ?? null,
    ofdDate: shipment?.ofdDate ?? null,
    deliveredDate: shipment?.deliveredDate ?? null,
  };

  return (
    <ol className="flex flex-col">
      {STAGES.map((stage, i) => {
        const done = i < current;
        const active = i === current;
        const date = formatDate(dates[stage.dateField]);
        return (
          <li key={stage.label} className="relative flex gap-4 pb-7 last:pb-0">
            {/* connector */}
            {i < STAGES.length - 1 && (
              <span
                aria-hidden
                className={`absolute left-[9px] top-5 h-full w-0.5 ${
                  done ? "bg-green" : "bg-mist/15"
                }`}
              />
            )}
            {/* dot */}
            <span className="relative z-10 mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
              {done && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green">
                  <svg
                    viewBox="0 0 12 12"
                    className="h-3 w-3 stroke-ink"
                    fill="none"
                    strokeWidth={2.5}
                    aria-hidden
                  >
                    <path d="M2 6.5 4.5 9 10 3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              )}
              {active && (
                <>
                  <span className="absolute h-5 w-5 animate-ping rounded-full bg-green/40" />
                  <span className="relative h-3.5 w-3.5 rounded-full bg-green" />
                </>
              )}
              {!done && !active && (
                <span className="h-3 w-3 rounded-full border-2 border-mist/25" />
              )}
            </span>
            {/* label */}
            <div className="min-w-0">
              <p
                className={`text-sm font-semibold ${
                  active ? "text-green" : done ? "text-mist" : "text-muted-dark"
                }`}
              >
                {stage.label}
              </p>
              {date && (done || active) && (
                <p className="mt-0.5 text-xs text-muted-dark">{date}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SkeletonDetail() {
  return (
    <div className="flex animate-pulse flex-col gap-4">
      <div className="h-7 w-32 rounded bg-mist/10" />
      <div className="h-64 rounded-lg border border-mist/10 bg-ink-2" />
      <div className="h-72 rounded-lg border border-mist/10 bg-ink-2" />
    </div>
  );
}

export default function PackageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = React.useState<{
    package: Pkg;
    shipment: Shipment | null;
    cbWaiting?: boolean;
    cbPreparing?: boolean;
    cbInOpenGroup?: boolean;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/packages/${id}`)
      .then(async (res) => {
        if (res.status === 404) throw new Error("notfound");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: Error) => {
        if (!cancelled)
          setError(
            e.message === "notfound"
              ? "We couldn't find that package."
              : "Couldn't load this package. Please try again."
          );
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const tracking = data ? trackingNumbers(data.package.tracking) : [];

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard/packages"
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
        Packages
      </Link>

      {error && (
        <div role="alert" className="rounded-md bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!data && !error && <SkeletonDetail />}

      {data && (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-3">
              <h1 className="sb-disp min-w-0 break-words text-2xl text-mist">
                {formatDescription(data.package.commodities) ?? "Package"}
              </h1>
              {/* A waiting package has no stage badge here: the Consolidated Billing
                  box right below says so in full, and a sentence-long badge beside
                  the name would squeeze it to a few letters on a phone. */}
              {!data.cbWaiting && (
                <span
                  className={`mt-1 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    STAGES[shipStatusToStage(data.shipment?.shipStatus ?? null)].badge
                  }`}
                >
                  {STAGES[shipStatusToStage(data.shipment?.shipStatus ?? null)].label}
                </span>
              )}
            </div>
            {tracking.length > 0 ? (
              <CopyTracking numbers={tracking} />
            ) : (
              <p className="text-sm font-medium text-muted-dark">
                Ref {shortRef(data.package.wr, data.package.packageCode)}
              </p>
            )}
          </div>

          {data.cbWaiting && (
            <section className="rounded-lg border border-violet-400/40 bg-violet-500/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-violet-300">{CB_NAME}</p>
              <p className="mt-1 text-sm font-semibold text-mist">{data.cbPreparing ? CB_PREPARING_TEXT : CB_WAITING_LABEL}</p>
              {!data.cbPreparing && (
                <p className="mt-1 text-xs text-muted-dark">
                  Everything that reaches our Miami warehouse within {HOLD_DAYS} days of your first package comes to your door
                  together, with one bill.
                </p>
              )}
            </section>
          )}

          {/* "Send my packages now" — any package in the customer's open group. */}
          {data.cbInOpenGroup && <SendMyPackagesNow />}

          {/* Package details */}
          <section className="rounded-lg border border-mist/10 bg-ink-2 px-4 py-1">
            <dl>
              {data.package.shipper && (
                <DetailRow label="Shipper" value={data.package.shipper} />
              )}
              <DetailRow label="Billing weight" value={`${data.package.weight} lb`} />
              {data.package.volumetricWeight > 0 && (
                <DetailRow
                  label="Volumetric"
                  value={`${data.package.volumetricWeight} lb`}
                />
              )}
              <DetailRow label="Pieces" value={data.package.pcs} />
              <DetailRow label="Freight" value={freightLabel(data.package.freight, data.package.transportMode)} />
              <DetailRow label="Received" value={formatDate(data.package.date)} />
              {data.shipment?.shipNo && (
                <DetailRow label="Shipment" value={data.shipment.shipNo} />
              )}
              {/* Our own codes — staff and WhatsApp support still ask for them. */}
              <DetailRow label="Swiftbox reference" value={shortRef(data.package.wr, data.package.packageCode)} />
              {data.package.packageCode && data.package.packageCode !== data.package.wr && (
                <DetailRow label="Warehouse receipt" value={data.package.wr} />
              )}
            </dl>
          </section>

          {data.package.transportMode && <div className="rounded-xl border p-4"><AirdropDocuments endpoint={`/api/packages/${data.package.id}/airdrop-documents`} /></div>}

          {/* Status timeline */}
          <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
            <h2 className="mb-5 text-xs font-semibold uppercase tracking-widest text-muted-dark">
              Delivery status
            </h2>
            <Stepper shipment={data.shipment} cbWaiting={!!data.cbWaiting} cbPreparing={!!data.cbPreparing} />
          </section>
        </>
      )}
    </div>
  );
}
