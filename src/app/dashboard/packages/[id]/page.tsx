"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  STAGES,
  freightLabel,
  shipStatusToStage,
} from "@/lib/status";

type Pkg = {
  id: number;
  wr: string;
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

function Stepper({ shipment }: { shipment: Shipment | null }) {
  // No shipment row = logged at Miami, not yet manifested → stage 0 active.
  const current = shipStatusToStage(shipment?.shipStatus ?? null);

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
          <div className="flex items-start justify-between gap-3">
            <h1 className="sb-disp text-2xl text-mist">{data.package.wr}</h1>
            <span
              className={`mt-1 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${
                STAGES[shipStatusToStage(data.shipment?.shipStatus ?? null)].badge
              }`}
            >
              {STAGES[shipStatusToStage(data.shipment?.shipStatus ?? null)].label}
            </span>
          </div>

          {/* Package details */}
          <section className="rounded-lg border border-mist/10 bg-ink-2 px-4 py-1">
            <dl>
              {data.package.commodities && (
                <DetailRow label="Contents" value={data.package.commodities} />
              )}
              {data.package.tracking && (
                <DetailRow
                  label="Tracking"
                  value={<span className="break-all">{data.package.tracking}</span>}
                />
              )}
              {data.package.shipper && (
                <DetailRow label="Shipper" value={data.package.shipper} />
              )}
              <DetailRow label="Weight" value={`${data.package.weight} lb`} />
              {data.package.volumetricWeight > 0 && (
                <DetailRow
                  label="Volumetric"
                  value={`${data.package.volumetricWeight} lb`}
                />
              )}
              <DetailRow label="Pieces" value={data.package.pcs} />
              <DetailRow label="Freight" value={freightLabel(data.package.freight)} />
              <DetailRow label="Received" value={formatDate(data.package.date)} />
              {data.shipment?.shipNo && (
                <DetailRow label="Shipment" value={data.shipment.shipNo} />
              )}
            </dl>
          </section>

          {/* Status timeline */}
          <section className="rounded-lg border border-mist/10 bg-ink-2 p-5">
            <h2 className="mb-5 text-xs font-semibold uppercase tracking-widest text-muted-dark">
              Delivery status
            </h2>
            <Stepper shipment={data.shipment} />
          </section>
        </>
      )}
    </div>
  );
}
