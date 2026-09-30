"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import PrealertClosed from "@/components/PrealertClosed";
import InvoiceFileField, { uploadPrealertFile, useUploadsEnabled } from "@/components/InvoiceFileField";
import { DESCRIPTION_MAX, parseDescription, parseValueUsd } from "@/lib/prealert-pick";

const inputCls =
  "w-full rounded-md border border-gray-200 bg-white px-4 py-3 text-base text-ink placeholder:text-gray-400 focus:outline-none focus:border-green focus:ring-2 focus:ring-green/40";
const labelCls = "mb-1.5 block text-xs font-semibold text-muted";

type Field = "description" | "valueUsd";

/**
 * The only two things we can't know from the package. Sends packageId +
 * those two fields; the server takes everything else from the package row.
 */
export default function PickForm({ packageId }: { packageId: number }) {
  const router = useRouter();
  const [description, setDescription] = React.useState("");
  const [valueUsd, setValueUsd] = React.useState("");
  const [error, setError] = React.useState<{ text: string; field?: Field } | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [closed, setClosed] = React.useState(false);
  const uploadsOn = useUploadsEnabled();
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [preparing, setPreparing] = React.useState(false);

  function go(next: number | null, remaining: number, status: "saved" | "already" | "filefail" | "alreadyfile") {
    if (next) {
      router.push(`/dashboard/prealert/${next}?toast=${status}&left=${remaining}`);
    } else {
      router.push(`/dashboard/prealerts?toast=${status === "saved" ? "done" : status}`);
    }
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (!parseDescription(description)) {
      setError({ text: "Tell us what's inside.", field: "description" });
      return;
    }
    if (parseValueUsd(valueUsd) == null) {
      setError({ text: "Enter the value in US dollars, e.g. 12.50.", field: "valueUsd" });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/prealerts/pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId, description, valueUsd }),
      });
      const data = await res.json().catch(() => null);
      if (res.status === 409 || data?.status === "closed") {
        setClosed(true);
        return;
      }
      if (!res.ok || (data?.status !== "saved" && data?.status !== "already")) {
        setError({ text: data?.error ?? "Something went wrong. Please try again.", field: data?.field });
        setSubmitting(false);
        return;
      }
      // The pre-alert is saved; the optional invoice attaches to it now. A failed
      // upload never undoes the pre-alert — the toast says so instead.
      let status: "saved" | "already" | "filefail" | "alreadyfile" = data.status;
      // Already pre-alerted (another tab): the new file has nothing of ours to attach to — say so.
      if (file && data.status === "already") status = "alreadyfile";
      if (file && data.status === "saved" && Number(data.prealertId) > 0) {
        setUploading(true);
        if (!(await uploadPrealertFile(Number(data.prealertId), file))) status = "filefail";
      }
      // Stay "submitting" while we navigate so a second tap can't fire.
      go(data.next ?? null, Number(data.remaining) || 0, status);
    } catch {
      setError({ text: "Something went wrong. Please try again." });
      setSubmitting(false);
    }
  }

  if (closed) return <PrealertClosed />;

  return (
    <section className="rounded-xl bg-white p-5 shadow-2xl">
      <form onSubmit={handleSubmit} noValidate>
        {error && (
          <div role="alert" className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {error.text}
          </div>
        )}

        <label className="mb-4 block">
          <span className={labelCls}>What&apos;s inside?</span>
          <textarea
            className={`${inputCls} min-h-[80px] resize-y`}
            placeholder="e.g. 2 pairs of sneakers"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={DESCRIPTION_MAX}
            aria-invalid={error?.field === "description" || undefined}
            required
          />
        </label>

        <label className="mb-6 block">
          <span className={labelCls}>Value (USD)</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className={inputCls}
            placeholder="0.00"
            value={valueUsd}
            onChange={(e) => setValueUsd(e.target.value)}
            aria-invalid={error?.field === "valueUsd" || undefined}
            required
          />
          <span className="mt-1.5 block text-xs text-muted">What you paid, as on your invoice.</span>
        </label>

        {uploadsOn && <InvoiceFileField file={file} onChange={setFile} disabled={submitting} onBusy={setPreparing} />}

        <button
          type="submit"
          disabled={submitting || preparing}
          className="w-full rounded-xl bg-green px-6 py-3.5 text-sm font-bold text-ink transition-colors hover:bg-green-deep disabled:opacity-60"
        >
          {uploading ? "Uploading invoice…" : submitting ? "Submitting…" : "Submit pre-alert"}
        </button>
      </form>
    </section>
  );
}
