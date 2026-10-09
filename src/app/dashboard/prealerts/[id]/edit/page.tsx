"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PrealertForm, { type EditablePrealert } from "@/components/PrealertForm";

type Loaded = EditablePrealert & { locked: boolean; lockMessage: string | null };

/**
 * Edit one of the customer's own pre-alerts — the new-pre-alert form, filled
 * in. A locked pre-alert (its package has cleared customs or been invoiced)
 * shows why instead of the form; the server refuses the change anyway.
 */
export default function EditPreAlertPage() {
  const { id } = useParams<{ id: string }>();
  const [prealert, setPrealert] = React.useState<Loaded | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/prealerts/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (res.status === 404) throw new Error("notfound");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setPrealert(data.prealert);
      })
      .catch((e: Error) => {
        if (!cancelled)
          setError(e.message === "notfound" ? "We couldn't find that pre-alert." : "Couldn't load your pre-alert. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard/prealerts"
        className="flex w-fit items-center gap-1.5 text-sm font-semibold text-muted-dark transition-colors hover:text-mist"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        Pre-alerts
      </Link>

      <h1 className="sb-disp text-2xl text-mist">Edit pre-alert</h1>

      {error && (
        <div role="alert" className="rounded-md bg-red-400/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {!prealert && !error && <div className="h-96 animate-pulse rounded-xl bg-ink-2" />}

      {prealert?.locked && (
        <div className="rounded-lg border border-mist/10 bg-ink-2 px-4 py-3 text-sm text-mist">
          {prealert.lockMessage}
        </div>
      )}

      {prealert && !prealert.locked && <PrealertForm edit={prealert} />}
    </div>
  );
}
