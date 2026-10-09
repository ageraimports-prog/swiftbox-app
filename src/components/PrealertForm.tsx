"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import InvoiceFileField, { uploadPrealertFile, useUploadsEnabled } from "@/components/InvoiceFileField";
import { TRACKING_LOCKED_MESSAGE } from "@/lib/prealert-edit-core";

const inputCls =
  "w-full rounded-md border border-gray-200 bg-white px-4 py-3 text-base text-ink placeholder:text-gray-400 focus:outline-none focus:border-green focus:ring-2 focus:ring-green/40";
const readOnlyCls = "w-full rounded-md border border-gray-200 bg-gray-100 px-4 py-3 text-base text-muted";
const labelCls = "mb-1.5 block text-xs font-semibold text-muted";
const errCls = "mt-1 block text-xs font-semibold text-red-600";

type Freight = "AIR" | "SEA";
type FieldKey = "tracking" | "store" | "description" | "itemCount" | "value" | "freight";

/** The values an edit starts from — exactly what GET /api/prealerts/[id] returns. */
export type EditablePrealert = {
  id: number;
  values: Record<FieldKey, string>;
  canEditTracking: boolean;
  hasFile: boolean;
};

/**
 * The pre-alert form — new (POST /api/prealerts) and edit (PATCH
 * /api/prealerts/[id]). Descriptions are shown and sent in capitals, the way
 * they are stored. On an edit the tracking number is read-only once it matches
 * a package (the server refuses a change anyway), and the form sends the values
 * it opened with so a change made elsewhere meanwhile is refused (409), never
 * overwritten.
 */
export default function PrealertForm({ edit }: { edit?: EditablePrealert }) {
  const router = useRouter();
  const v = edit?.values;

  const [storeName, setStoreName] = React.useState(v?.store ?? "");
  const [trackingNumber, setTrackingNumber] = React.useState(v?.tracking ?? "");
  const [description, setDescription] = React.useState((v?.description ?? "").toUpperCase());
  const [itemCount, setItemCount] = React.useState(v?.itemCount ?? "1");
  const [invoiceValueUsd, setInvoiceValueUsd] = React.useState(v?.value ?? "");
  const [freightType, setFreightType] = React.useState<Freight>((v?.freight as Freight) || "AIR");

  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Partial<Record<FieldKey, string>>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const uploadsOn = useUploadsEnabled();
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [preparing, setPreparing] = React.useState(false);

  const trackingLocked = edit ? !edit.canEditTracking : false;

  function clientValidate(): string | null {
    if (!storeName.trim()) return "Store / merchant name is required.";
    if (!trackingNumber.trim()) return "US tracking number is required.";
    if (!description.trim()) return "Description of contents is required.";
    const count = Number(itemCount);
    if (!Number.isInteger(count) || count < 1)
      return "Number of items must be a whole number of at least 1.";
    const value = Number(invoiceValueUsd);
    if (!Number.isFinite(value) || value <= 0)
      return "Invoice total must be greater than 0.";
    return null;
  }

  async function submitNew(): Promise<void> {
    const res = await fetch("/api/prealerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeName: storeName.trim(),
        trackingNumber: trackingNumber.trim(),
        description: description.trim(),
        itemCount: Number(itemCount),
        invoiceValueUsd: Number(invoiceValueUsd),
        freightType,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }
    // The pre-alert is saved; the optional invoice attaches to it now. A
    // failed upload never undoes the pre-alert — the list's toast says so.
    let fileFailed = false;
    if (file && Number(data?.prealert_id) > 0) {
      setUploading(true);
      fileFailed = !(await uploadPrealertFile(Number(data.prealert_id), file));
    }
    router.push(fileFailed ? "/dashboard/prealerts?toast=filefail" : "/dashboard/prealerts");
    router.refresh();
  }

  async function submitEdit(e: EditablePrealert): Promise<void> {
    const res = await fetch(`/api/prealerts/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          ...(trackingLocked ? {} : { tracking: trackingNumber.trim() }),
          store: storeName.trim(),
          description: description.trim(),
          itemCount: itemCount.trim(),
          value: invoiceValueUsd.trim(),
          freight: freightType,
        },
        expected: e.values,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(data?.error ?? "Something went wrong. Please try again.");
      setFieldErrors(data?.errors ?? {});
      setSubmitting(false);
      return;
    }
    let fileFailed = false;
    if (file) {
      setUploading(true);
      fileFailed = !(await uploadPrealertFile(e.id, file, e.hasFile));
    }
    router.push(`/dashboard/prealerts?toast=${fileFailed ? "editfilefail" : "edited"}`);
    router.refresh();
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError(null);
    setFieldErrors({});
    const clientError = clientValidate();
    if (clientError) {
      setError(clientError);
      return;
    }
    setSubmitting(true);
    try {
      if (edit) await submitEdit(edit);
      else await submitNew();
    } catch {
      setError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  const fieldError = (k: FieldKey) => (fieldErrors[k] ? <span className={errCls}>{fieldErrors[k]}</span> : null);

  return (
    <section className="rounded-xl bg-white p-5 shadow-2xl">
      <form onSubmit={handleSubmit} noValidate>
        {error && (
          <div role="alert" className="mb-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <label className="mb-4 block">
          <span className={labelCls}>Description of contents</span>
          <textarea
            className={`${inputCls} min-h-[80px] resize-y uppercase`}
            placeholder="WHAT'S IN THE PACKAGE?"
            value={description}
            onChange={(e) => setDescription(e.target.value.toUpperCase())}
            required
          />
          {fieldError("description")}
        </label>

        <label className="mb-4 block">
          <span className={labelCls}>US tracking number</span>
          {trackingLocked ? (
            <>
              <input type="text" className={readOnlyCls} value={trackingNumber} readOnly aria-readonly />
              <span className="mt-1 block text-xs text-muted">{TRACKING_LOCKED_MESSAGE}</span>
            </>
          ) : (
            <input
              type="text"
              className={inputCls}
              placeholder="Carrier tracking number"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              maxLength={100}
              autoCapitalize="characters"
              autoCorrect="off"
              required
            />
          )}
          {fieldError("tracking")}
        </label>

        <label className="mb-4 block">
          <span className={labelCls}>Store / merchant name</span>
          <input
            type="text"
            className={inputCls}
            placeholder="e.g. Amazon"
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            maxLength={100}
            required
          />
          {fieldError("store")}
        </label>

        <div className="mb-4 flex gap-3">
          <label className="block w-24">
            <span className={labelCls}>Items</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              className={inputCls}
              value={itemCount}
              onChange={(e) => setItemCount(e.target.value)}
              required
            />
            {fieldError("itemCount")}
          </label>

          <label className="block flex-1">
            <span className={labelCls}>Invoice total (USD)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              className={inputCls}
              placeholder="0.00"
              value={invoiceValueUsd}
              onChange={(e) => setInvoiceValueUsd(e.target.value)}
              required
            />
            {fieldError("value")}
          </label>
        </div>

        <div className="mb-6">
          <span className={labelCls}>Freight type</span>
          <div
            role="radiogroup"
            aria-label="Freight type"
            className="grid grid-cols-2 gap-1 rounded-md bg-gray-100 p-1"
          >
            {(["AIR", "SEA"] as Freight[]).map((opt) => {
              const active = freightType === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setFreightType(opt)}
                  className={`rounded-[6px] py-2.5 text-sm font-bold transition-colors ${
                    active ? "bg-green text-ink shadow-sm" : "text-muted hover:text-ink"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
          {fieldError("freight")}
        </div>

        {uploadsOn && (
          <InvoiceFileField
            file={file}
            onChange={setFile}
            disabled={submitting}
            onBusy={setPreparing}
            replacing={Boolean(edit?.hasFile)}
          />
        )}

        <button
          type="submit"
          disabled={submitting || preparing}
          className="w-full rounded-xl bg-green px-6 py-3.5 text-sm font-bold text-ink transition-colors hover:bg-green-deep disabled:opacity-60"
        >
          {uploading
            ? "Uploading invoice…"
            : submitting
              ? edit
                ? "Saving…"
                : "Submitting…"
              : edit
                ? "Save changes"
                : "Submit Pre-alert"}
        </button>
      </form>
    </section>
  );
}
